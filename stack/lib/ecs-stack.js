"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_ecs_1 = require("@aws-cdk/aws-ecs");
const aws_ecs_patterns_1 = require("@aws-cdk/aws-ecs-patterns");
const AWS = require("aws-sdk");
const config_1 = require("./config");
class ECSStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const applicationSGId = core_1.Fn.importValue('modeldb-application-sg');
        const appSecurityGroup = aws_ec2_1.SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', applicationSGId);
        this.cluster = new aws_ecs_1.Cluster(this, 'modeldb-ecs-cluster', {
            vpc: props.vpc,
            clusterName: 'modeldb-ecs-cluster'
        });
        this.publicSubnets = props.vpc.selectSubnets({
            subnetType: aws_ec2_1.SubnetType.PUBLIC
        });
        const config = new config_1.ConfigOptions();
        this.logDriver = new aws_ecs_1.AwsLogDriver({
            streamPrefix: "verta-ai-aws-ecs-service",
        });
        this.clusterASG = this.cluster.addCapacity('DefaultAutoScalingGroup', {
            instanceType: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.M4, aws_ec2_1.InstanceSize.LARGE),
            keyName: 'datafy-keypair',
            associatePublicIpAddress: true,
            vpcSubnets: this.publicSubnets,
        });
        const dbUrl = core_1.Fn.importValue('modeldb-rds-url');
        this.instanceUserData = `
#!/bin/bash
mkdir -p /ecs/backend/config/
cat <<< '
#This config is used by docker compose.
#ModelDB Properties
grpcServer:
  port: 8085

springServer:
  port: 8086
  shutdownTimeout: 30 #time in second

artifactStoreConfig:
  artifactStoreType: NFS #S3, GCP, NFS
  NFS:
    nfsUrlProtocol: http
    nfsRootPath: /artifact-store/
    artifactEndpoint:
      getArtifact: "api/v1/artifact/getArtifact"
      storeArtifact: "api/v1/artifact/storeArtifact"

# Database settings (type mongodb, couchbasedb, relational etc..)
database:
  DBType: relational
  timeout: 4
  liquibaseLockThreshold: 60 #time in second
  RdbConfiguration:
    RdbDatabaseName: postgres
    RdbDriver: "org.postgresql.Driver"
    RdbDialect: "org.hibernate.dialect.PostgreSQLDialect"
    RdbUrl: "${dbUrl}"
    RdbUsername: "${props.dbUsername}"
    RdbPassword: "#dbPassword"

# Test Database settings (type mongodb, couchbasedb etc..)
test:
  test-database:
    DBType: relational
    timeout: 4
    liquibaseLockThreshold: 60 #time in second
    RdbConfiguration:
      RdbDatabaseName: postgres
      RdbDriver: "org.postgresql.Driver"
      RdbDialect: "org.hibernate.dialect.PostgreSQLDialect"
      RdbUrl: "jdbc:postgresql://modeldb-postgres:5432"
      RdbUsername: postgres
      RdbPassword: root

#ArtifactStore Properties
artifactStore_grpcServer:
  host: modeldb-backend
  port: 8086

telemetry:
  opt_in: true
  frequency: 1 #frequency to share data in hours, default 1
  consumer: https://app.verta.ai/api/v1/uac-proxy/telemetry/collectTelemetry' > /ecs/backend/config/config.yaml`;
        const secretsmanager = new AWS.SecretsManager();
        let _self = this;
        let _params = {
            SecretId: "modeldb-postgres-cdb",
            VersionStage: "AWSCURRENT"
        };
        secretsmanager.getSecretValue(_params, function (error, data) {
            if (error)
                console.log(error, error.stack);
            else {
                let secureString = data['SecretString'];
                let secureStringObj = JSON.parse(String(secureString));
                let password = secureStringObj['password'];
                let userData = _self.instanceUserData.replace('#dbPassword', password);
                _self.clusterASG.addUserData(userData);
            }
        });
        // this.clusterASG.addUserData(this.instanceUserData);
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        this.clusterASG.addSecurityGroup(appSecurityGroup);
        this.taskDefinition = new aws_ecs_1.Ec2TaskDefinition(this, 'modeldb-awspvc', {
            networkMode: aws_ecs_1.NetworkMode.AWS_VPC,
        });
        this.taskDefinition.addVolume({
            name: 'artifact-store',
            host: {
                sourcePath: '/ecs/artifact-store'
            }
        });
        this.taskDefinition.addVolume({
            name: 'config',
            host: {
                sourcePath: '/ecs/backend/config'
            }
        });
        // define containers below
        const modeldbBackend = this.taskDefinition.addContainer('modeldb-backend', {
            image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBBackEnd),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,
            environment: {
                VERTA_MODELDB_CONFIG: '/config/config.yaml'
            },
            logging: this.logDriver
        });
        modeldbBackend.addPortMappings({
            containerPort: 8085,
            hostPort: 8085,
            protocol: aws_ecs_1.Protocol.TCP,
        }, {
            containerPort: 8086,
            hostPort: 8086,
            protocol: aws_ecs_1.Protocol.TCP,
        });
        modeldbBackend.addMountPoints({
            sourceVolume: 'artifact-store',
            containerPath: '/artifact-store/',
            readOnly: false
        }, {
            sourceVolume: 'config',
            containerPath: '/config/',
            readOnly: false
        });
        const modeldbProxy = this.taskDefinition.addContainer('modeldb-proxy', {
            image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBProxy),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,
            environment: {
                MDB_ADDRESS: "modeldb-backend:8085",
                SERVER_HTTP_PORT: "8080"
            },
            logging: this.logDriver
        });
        modeldbProxy.addPortMappings({
            containerPort: 8080,
            hostPort: 8080,
            protocol: aws_ecs_1.Protocol.TCP,
        });
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8085));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8086));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(80));
        // Create the backend service
        this.ec2Service = new aws_ecs_1.Ec2Service(this, 'modeldb-backend-service', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            securityGroup: appSecurityGroup,
            serviceName: 'modeldb-backend-service',
        });
        new aws_ecs_patterns_1.ApplicationLoadBalancedEc2Service(this, 'modeldb-ecs-service', {
            cluster: this.cluster,
            listenerPort: 80,
            cpu: 100,
            publicLoadBalancer: true,
            memoryLimitMiB: 256,
            serviceName: 'modeldb-frontend-service',
            taskImageOptions: {
                image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBFrontend),
                containerPort: 3000,
                containerName: 'modeldb-frontend',
                environment: {
                    DEPLOYED: "yes",
                    BACKEND_API_PROTOCOL: "http",
                    BACKEND_API_DOMAIN: "modeldb-proxy:8080",
                    MDB_ADDRESS: "http://modeldb-proxy:8080",
                    ARTIFACTORY_ADDRESS: "http://modeldb-backend:8086"
                },
                logDriver: this.logDriver,
            }
        });
    }
}
exports.ECSStack = ECSStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWNzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQTJEO0FBRTNELDhDQUEwSTtBQUMxSSw4Q0FBOEg7QUFDOUgsZ0VBQTRFO0FBQzVFLCtCQUErQjtBQUMvQixxQ0FBeUM7QUFRekMsTUFBYSxRQUFTLFNBQVEsWUFBSztJQWEvQixZQUFZLEtBQVUsRUFBRSxFQUFVLEVBQUUsS0FBb0I7UUFDcEQsS0FBSyxDQUFDLEtBQUssRUFBRSxFQUFFLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFFeEIsTUFBTSxlQUFlLEdBQUcsU0FBRSxDQUFDLFdBQVcsQ0FBQyx3QkFBd0IsQ0FBQyxDQUFDO1FBQ2pFLE1BQU0sZ0JBQWdCLEdBQUcsdUJBQWEsQ0FBQyxtQkFBbUIsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFFdkcsSUFBSSxDQUFDLE9BQU8sR0FBRyxJQUFJLGlCQUFPLENBQUMsSUFBSSxFQUFFLHFCQUFxQixFQUFFO1lBQ3BELEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFdBQVcsRUFBRSxxQkFBcUI7U0FDckMsQ0FBQyxDQUFDO1FBQ0gsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztZQUN6QyxVQUFVLEVBQUUsb0JBQVUsQ0FBQyxNQUFNO1NBQ2hDLENBQUMsQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLElBQUksc0JBQWEsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxzQkFBWSxDQUFDO1lBQzlCLFlBQVksRUFBRSwwQkFBMEI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRTtZQUNsRSxZQUFZLEVBQUUsc0JBQVksQ0FBQyxFQUFFLENBQUMsdUJB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QUNKLENBQUMsQ0FBQztJQUVQLENBQUM7Q0FDSjtBQTFPRCw0QkEwT0MiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBTdGFjaywgU3RhY2tQcm9wcywgRm4sIEFwcCB9IGZyb20gXCJAYXdzLWNkay9jb3JlXCI7XG5pbXBvcnQgeyBBdXRvU2NhbGluZ0dyb3VwIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWF1dG9zY2FsaW5nJ1xuaW1wb3J0IHsgU3VibmV0VHlwZSwgVnBjLCBTdWJuZXRTZWxlY3Rpb24sIEluc3RhbmNlVHlwZSwgSW5zdGFuY2VDbGFzcywgSW5zdGFuY2VTaXplLCBTZWN1cml0eUdyb3VwLCBQZWVyLCBQb3J0IH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1lYzJcIjtcbmltcG9ydCB7IEF3c0xvZ0RyaXZlciwgRWMyVGFza0RlZmluaXRpb24sIE5ldHdvcmtNb2RlLCBDb250YWluZXJJbWFnZSwgQ2x1c3RlciwgRWMyU2VydmljZSwgUHJvdG9jb2x9IGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3MnO1xuaW1wb3J0IHtBcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEVjMlNlcnZpY2V9IGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3MtcGF0dGVybnMnO1xuaW1wb3J0ICogYXMgQVdTIGZyb20gJ2F3cy1zZGsnO1xuaW1wb3J0IHsgQ29uZmlnT3B0aW9ucyB9IGZyb20gJy4vY29uZmlnJztcblxuXG5leHBvcnQgaW50ZXJmYWNlIEVDU1N0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgICB2cGM6IFZwYyxcbiAgICBkYlVzZXJuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFQ1NTdGFjayBleHRlbmRzIFN0YWNrIHtcblxuICAgIHJlYWRvbmx5IGNsdXN0ZXI6IENsdXN0ZXI7XG4gICAgcmVhZG9ubHkgZWMyU2VydmljZTogRWMyU2VydmljZTtcbiAgICByZWFkb25seSBwdWJsaWNTdWJuZXRzOiBTdWJuZXRTZWxlY3Rpb247XG4gICAgcmVhZG9ubHkgY2x1c3RlckFTRzogQXV0b1NjYWxpbmdHcm91cDtcbiAgICByZWFkb25seSBpbnN0YW5jZVVzZXJEYXRhOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZWNzQ2x1c3RlclNlY3VyaXR5R3JvdXA6IFNlY3VyaXR5R3JvdXA7XG4gICAgcmVhZG9ubHkgY29udGFpbmVyU2VjdXJpdHlHcm91cDogU2VjdXJpdHlHcm91cDtcbiAgICByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogRWMyVGFza0RlZmluaXRpb247XG4gICAgcmVhZG9ubHkgbG9nRHJpdmVyOiBBd3NMb2dEcml2ZXI7XG4gICAgXG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQXBwLCBpZDogc3RyaW5nLCBwcm9wczogRUNTU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGFwcGxpY2F0aW9uU0dJZCA9IEZuLmltcG9ydFZhbHVlKCdtb2RlbGRiLWFwcGxpY2F0aW9uLXNnJyk7XG4gICAgICAgIGNvbnN0IGFwcFNlY3VyaXR5R3JvdXAgPSBTZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ2VjMi1TZWN1cml0eUdyb3VwJywgYXBwbGljYXRpb25TR0lkKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMuY2x1c3RlciA9IG5ldyBDbHVzdGVyKHRoaXMsICdtb2RlbGRiLWVjcy1jbHVzdGVyJywgeyBcbiAgICAgICAgICAgIHZwYzogcHJvcHMudnBjLFxuICAgICAgICAgICAgY2x1c3Rlck5hbWU6ICdtb2RlbGRiLWVjcy1jbHVzdGVyJ1xuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5wdWJsaWNTdWJuZXRzID0gcHJvcHMudnBjLnNlbGVjdFN1Ym5ldHMoe1xuICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QVUJMSUNcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWdPcHRpb25zKCk7XG4gICAgICAgIHRoaXMubG9nRHJpdmVyID0gbmV3IEF3c0xvZ0RyaXZlcih7XG4gICAgICAgICAgICBzdHJlYW1QcmVmaXg6IFwidmVydGEtYWktYXdzLWVjcy1zZXJ2aWNlXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY2x1c3RlckFTRyA9IHRoaXMuY2x1c3Rlci5hZGRDYXBhY2l0eSgnRGVmYXVsdEF1dG9TY2FsaW5nR3JvdXAnLCB7XG4gICAgICAgICAgICBpbnN0YW5jZVR5cGU6IEluc3RhbmNlVHlwZS5vZihJbnN0YW5jZUNsYXNzLk00LCBJbnN0YW5jZVNpemUuTEFSR0UpLFxuICAgICAgICAgICAga2V5TmFtZTogJ2RhdGFmeS1rZXlwYWlyJyxcbiAgICAgICAgICAgIGFzc29jaWF0ZVB1YmxpY0lwQWRkcmVzczogdHJ1ZSxcbiAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHRoaXMucHVibGljU3VibmV0cyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGRiVXJsID0gRm4uaW1wb3J0VmFsdWUoJ21vZGVsZGItcmRzLXVybCcpO1xuICAgICAgICB0aGlzLmluc3RhbmNlVXNlckRhdGEgPSBgXG4jIS9iaW4vYmFzaFxubWtkaXIgLXAgL2Vjcy9iYWNrZW5kL2NvbmZpZy9cbmNhdCA8PDwgJ1xuI1RoaXMgY29uZmlnIGlzIHVzZWQgYnkgZG9ja2VyIGNvbXBvc2UuXG4jTW9kZWxEQiBQcm9wZXJ0aWVzXG5ncnBjU2VydmVyOlxuICBwb3J0OiA4MDg1XG5cbnNwcmluZ1NlcnZlcjpcbiAgcG9ydDogODA4NlxuICBzaHV0ZG93blRpbWVvdXQ6IDMwICN0aW1lIGluIHNlY29uZFxuXG5hcnRpZmFjdFN0b3JlQ29uZmlnOlxuICBhcnRpZmFjdFN0b3JlVHlwZTogTkZTICNTMywgR0NQLCBORlNcbiAgTkZTOlxuICAgIG5mc1VybFByb3RvY29sOiBodHRwXG4gICAgbmZzUm9vdFBhdGg6IC9hcnRpZmFjdC1zdG9yZS9cbiAgICBhcnRpZmFjdEVuZHBvaW50OlxuICAgICAgZ2V0QXJ0aWZhY3Q6IFwiYXBpL3YxL2FydGlmYWN0L2dldEFydGlmYWN0XCJcbiAgICAgIHN0b3JlQXJ0aWZhY3Q6IFwiYXBpL3YxL2FydGlmYWN0L3N0b3JlQXJ0aWZhY3RcIlxuXG4jIERhdGFiYXNlIHNldHRpbmdzICh0eXBlIG1vbmdvZGIsIGNvdWNoYmFzZWRiLCByZWxhdGlvbmFsIGV0Yy4uKVxuZGF0YWJhc2U6XG4gIERCVHlwZTogcmVsYXRpb25hbFxuICB0aW1lb3V0OiA0XG4gIGxpcXVpYmFzZUxvY2tUaHJlc2hvbGQ6IDYwICN0aW1lIGluIHNlY29uZFxuICBSZGJDb25maWd1cmF0aW9uOlxuICAgIFJkYkRhdGFiYXNlTmFtZTogcG9zdGdyZXNcbiAgICBSZGJEcml2ZXI6IFwib3JnLnBvc3RncmVzcWwuRHJpdmVyXCJcbiAgICBSZGJEaWFsZWN0OiBcIm9yZy5oaWJlcm5hdGUuZGlhbGVjdC5Qb3N0Z3JlU1FMRGlhbGVjdFwiXG4gICAgUmRiVXJsOiBcIiR7ZGJVcmx9XCJcbiAgICBSZGJVc2VybmFtZTogXCIke3Byb3BzLmRiVXNlcm5hbWV9XCJcbiAgICBSZGJQYXNzd29yZDogXCIjZGJQYXNzd29yZFwiXG5cbiMgVGVzdCBEYXRhYmFzZSBzZXR0aW5ncyAodHlwZSBtb25nb2RiLCBjb3VjaGJhc2VkYiBldGMuLilcbnRlc3Q6XG4gIHRlc3QtZGF0YWJhc2U6XG4gICAgREJUeXBlOiByZWxhdGlvbmFsXG4gICAgdGltZW91dDogNFxuICAgIGxpcXVpYmFzZUxvY2tUaHJlc2hvbGQ6IDYwICN0aW1lIGluIHNlY29uZFxuICAgIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgICBSZGJEYXRhYmFzZU5hbWU6IHBvc3RncmVzXG4gICAgICBSZGJEcml2ZXI6IFwib3JnLnBvc3RncmVzcWwuRHJpdmVyXCJcbiAgICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICAgIFJkYlVybDogXCJqZGJjOnBvc3RncmVzcWw6Ly9tb2RlbGRiLXBvc3RncmVzOjU0MzJcIlxuICAgICAgUmRiVXNlcm5hbWU6IHBvc3RncmVzXG4gICAgICBSZGJQYXNzd29yZDogcm9vdFxuXG4jQXJ0aWZhY3RTdG9yZSBQcm9wZXJ0aWVzXG5hcnRpZmFjdFN0b3JlX2dycGNTZXJ2ZXI6XG4gIGhvc3Q6IG1vZGVsZGItYmFja2VuZFxuICBwb3J0OiA4MDg2XG5cbnRlbGVtZXRyeTpcbiAgb3B0X2luOiB0cnVlXG4gIGZyZXF1ZW5jeTogMSAjZnJlcXVlbmN5IHRvIHNoYXJlIGRhdGEgaW4gaG91cnMsIGRlZmF1bHQgMVxuICBjb25zdW1lcjogaHR0cHM6Ly9hcHAudmVydGEuYWkvYXBpL3YxL3VhYy1wcm94eS90ZWxlbWV0cnkvY29sbGVjdFRlbGVtZXRyeScgPiAvZWNzL2JhY2tlbmQvY29uZmlnL2NvbmZpZy55YW1sYDtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IHNlY3JldHNtYW5hZ2VyID0gbmV3IEFXUy5TZWNyZXRzTWFuYWdlcigpO1xuICAgICAgICBsZXQgX3NlbGYgPSB0aGlzO1xuICAgICAgICBsZXQgX3BhcmFtcyA9IHtcbiAgICAgICAgICAgIFNlY3JldElkOiBcIm1vZGVsZGItcG9zdGdyZXMtY2RiXCIsIFxuICAgICAgICAgICAgVmVyc2lvblN0YWdlOiBcIkFXU0NVUlJFTlRcIlxuICAgICAgICB9XG4gICAgICAgIHNlY3JldHNtYW5hZ2VyLmdldFNlY3JldFZhbHVlKF9wYXJhbXMsIGZ1bmN0aW9uKGVycm9yLCBkYXRhKXtcbiAgICAgICAgICAgIGlmIChlcnJvcikgY29uc29sZS5sb2coZXJyb3IsIGVycm9yLnN0YWNrKTtcbiAgICAgICAgICAgIGVsc2Uge1xuICAgICAgICAgICAgICAgIGxldCBzZWN1cmVTdHJpbmcgPSBkYXRhWydTZWNyZXRTdHJpbmcnXTtcbiAgICAgICAgICAgICAgICBsZXQgc2VjdXJlU3RyaW5nT2JqID0gSlNPTi5wYXJzZShTdHJpbmcoc2VjdXJlU3RyaW5nKSk7XG4gICAgICAgICAgICAgICAgbGV0IHBhc3N3b3JkID0gc2VjdXJlU3RyaW5nT2JqWydwYXNzd29yZCddXG4gICAgICAgICAgICAgICAgbGV0IHVzZXJEYXRhID0gX3NlbGYuaW5zdGFuY2VVc2VyRGF0YS5yZXBsYWNlKCcjZGJQYXNzd29yZCcsIHBhc3N3b3JkKTtcbiAgICAgICAgICAgICAgICBfc2VsZi5jbHVzdGVyQVNHLmFkZFVzZXJEYXRhKHVzZXJEYXRhKTsgXG4gICAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICAvLyB0aGlzLmNsdXN0ZXJBU0cuYWRkVXNlckRhdGEodGhpcy5pbnN0YW5jZVVzZXJEYXRhKTtcblxuICAgICAgICBhcHBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCgyMikpXG4gICAgICAgIHRoaXMuY2x1c3RlckFTRy5hZGRTZWN1cml0eUdyb3VwKGFwcFNlY3VyaXR5R3JvdXApO1xuXG4gICAgICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgJ21vZGVsZGItYXdzcHZjJywge1xuICAgICAgICAgICAgbmV0d29ya01vZGU6IE5ldHdvcmtNb2RlLkFXU19WUEMsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2FydGlmYWN0LXN0b3JlJyxcbiAgICAgICAgICAgICAgICBob3N0OiB7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZVBhdGg6ICcvZWNzL2FydGlmYWN0LXN0b3JlJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgICBcbiAgICAgICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbmZpZycsXG4gICAgICAgICAgICAgICAgaG9zdDoge1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2VQYXRoOiAnL2Vjcy9iYWNrZW5kL2NvbmZpZydcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICAvLyBkZWZpbmUgY29udGFpbmVycyBiZWxvd1xuICAgICAgICBjb25zdCBtb2RlbGRiQmFja2VuZCA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdtb2RlbGRiLWJhY2tlbmQnLCB7XG4gICAgICAgICAgICBpbWFnZTogQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGNvbmZpZy52ZXJ0YUFJSW1hZ2VzLk1vZGVsREJCYWNrRW5kKSxcbiAgICAgICAgICAgIGNwdTogMTAwLFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgICAgIGVzc2VudGlhbDogdHJ1ZSwgICAgXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFZFUlRBX01PREVMREJfQ09ORklHOiAnL2NvbmZpZy9jb25maWcueWFtbCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dnaW5nOiB0aGlzLmxvZ0RyaXZlclxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIG1vZGVsZGJCYWNrZW5kLmFkZFBvcnRNYXBwaW5ncyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXJQb3J0OiA4MDg1LFxuICAgICAgICAgICAgICAgIGhvc3RQb3J0OiA4MDg1LFxuICAgICAgICAgICAgICAgIHByb3RvY29sOiBQcm90b2NvbC5UQ1AsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODYsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODYsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCwgXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBtb2RlbGRiQmFja2VuZC5hZGRNb3VudFBvaW50cyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdhcnRpZmFjdC1zdG9yZScsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyUGF0aDogJy9hcnRpZmFjdC1zdG9yZS8nLFxuICAgICAgICAgICAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdjb25maWcnLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvY29uZmlnLycsXG4gICAgICAgICAgICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgbW9kZWxkYlByb3h5ID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ21vZGVsZGItcHJveHknLCB7XG4gICAgICAgICAgICBpbWFnZTogQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGNvbmZpZy52ZXJ0YUFJSW1hZ2VzLk1vZGVsREJQcm94eSksXG4gICAgICAgICAgICBjcHU6IDEwMCxcbiAgICAgICAgICAgIG1lbW9yeUxpbWl0TWlCOiAyNTYsXG4gICAgICAgICAgICBlc3NlbnRpYWw6IHRydWUsICAgIFxuICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBNREJfQUREUkVTUzogXCJtb2RlbGRiLWJhY2tlbmQ6ODA4NVwiLFxuICAgICAgICAgICAgICAgIFNFUlZFUl9IVFRQX1BPUlQ6IFwiODA4MFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9nZ2luZzogdGhpcy5sb2dEcml2ZXJcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtb2RlbGRiUHJveHkuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICBhcHBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCg4MDg1KSk7XG4gICAgICAgIGFwcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDgwODYpKTtcbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoMjIpKTtcbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoODApKTtcblxuICAgICAgICAvLyBDcmVhdGUgdGhlIGJhY2tlbmQgc2VydmljZVxuICAgICAgICB0aGlzLmVjMlNlcnZpY2UgPSBuZXcgRWMyU2VydmljZSh0aGlzLCAnbW9kZWxkYi1iYWNrZW5kLXNlcnZpY2UnLCB7XG4gICAgICAgICAgICBjbHVzdGVyOiB0aGlzLmNsdXN0ZXIsXG4gICAgICAgICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy50YXNrRGVmaW5pdGlvbixcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IGFwcFNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICBzZXJ2aWNlTmFtZTogJ21vZGVsZGItYmFja2VuZC1zZXJ2aWNlJyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgbmV3IEFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRWMyU2VydmljZSh0aGlzLCAnbW9kZWxkYi1lY3Mtc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IHRoaXMuY2x1c3RlcixcbiAgICAgICAgICAgIGxpc3RlbmVyUG9ydDogODAsXG4gICAgICAgICAgICBjcHU6IDEwMCxcbiAgICAgICAgICAgIHB1YmxpY0xvYWRCYWxhbmNlcjogdHJ1ZSxcbiAgICAgICAgICAgIG1lbW9yeUxpbWl0TWlCOiAyNTYsXG4gICAgICAgICAgICBzZXJ2aWNlTmFtZTogJ21vZGVsZGItZnJvbnRlbmQtc2VydmljZScsXG4gICAgICAgICAgICB0YXNrSW1hZ2VPcHRpb25zOiB7XG4gICAgICAgICAgICAgICAgaW1hZ2U6IENvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShjb25maWcudmVydGFBSUltYWdlcy5Nb2RlbERCRnJvbnRlbmQpLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDMwMDAsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyTmFtZTogJ21vZGVsZGItZnJvbnRlbmQnLFxuICAgICAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgICAgIERFUExPWUVEOiBcInllc1wiLFxuICAgICAgICAgICAgICAgICAgICBCQUNLRU5EX0FQSV9QUk9UT0NPTDogXCJodHRwXCIsXG4gICAgICAgICAgICAgICAgICAgIEJBQ0tFTkRfQVBJX0RPTUFJTjogXCJtb2RlbGRiLXByb3h5OjgwODBcIixcbiAgICAgICAgICAgICAgICAgICAgTURCX0FERFJFU1M6IFwiaHR0cDovL21vZGVsZGItcHJveHk6ODA4MFwiLFxuICAgICAgICAgICAgICAgICAgICBBUlRJRkFDVE9SWV9BRERSRVNTOiBcImh0dHA6Ly9tb2RlbGRiLWJhY2tlbmQ6ODA4NlwiXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICBsb2dEcml2ZXI6IHRoaXMubG9nRHJpdmVyLFxuICAgICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgfVxufSJdfQ==