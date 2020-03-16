"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_ecs_1 = require("@aws-cdk/aws-ecs");
const aws_ecs_patterns_1 = require("@aws-cdk/aws-ecs-patterns");
const config_1 = require("./config");
class ECSStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        // const dbPassword = Secret.fromSecretAttributes(this, 'SamplePassword', {
        //     secretArn: 'arn:aws:secretsmanager:{region}:{organisation-id}:secret:modeldb-postgress-password',
        // });
        const applicationSGId = core_1.Fn.importValue('modeldb-application-sg');
        const appSecurityGroup = aws_ec2_1.SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', applicationSGId);
        this.cluster = new aws_ecs_1.Cluster(this, 'awsvpc-verta-ai-ecs-cluster', { vpc: props.vpc });
        this.publicSubnets = props.vpc.selectSubnets({
            subnetType: aws_ec2_1.SubnetType.PUBLIC
        });
        const config = new config_1.ConfigOptions();
        this.logDriver = new aws_ecs_1.AwsLogDriver({
            streamPrefix: "verta-ai-aws-ecs-service",
        });
        this.clusterASG = this.cluster.addCapacity('DefaultAutoScalingGroup', {
            instanceType: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.T2, aws_ec2_1.InstanceSize.MICRO),
            keyName: 'datafy-keypair',
            vpcSubnets: this.publicSubnets,
        });
        const dbUrl = core_1.Fn.importValue('modeldb-rds-url');
        const testPass = 'testpassword';
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
    RdbPassword: "${testPass}"

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
        this.clusterASG.addUserData(this.instanceUserData);
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
        const modeldbFrontend = this.taskDefinition.addContainer('modeldb-frontend', {
            image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBFrontend),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,
            environment: {
                DEPLOYED: "yes",
                BACKEND_API_PROTOCOL: "http",
                BACKEND_API_DOMAIN: "modeldb-proxy:8080",
                MDB_ADDRESS: "http://modeldb-proxy:8080",
                ARTIFACTORY_ADDRESS: "http://modeldb-backend:8086"
            },
            logging: this.logDriver
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
        modeldbFrontend.addPortMappings({
            containerPort: 80,
            hostPort: 80,
            protocol: aws_ecs_1.Protocol.TCP,
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
        modeldbProxy.addPortMappings({
            containerPort: 8080,
            hostPort: 8080,
            protocol: aws_ecs_1.Protocol.TCP,
        });
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8085));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8086));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(80));
        const elbService = new aws_ecs_patterns_1.ApplicationLoadBalancedEc2Service(this, 'modeldb-ecs-service', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            listenerPort: 80,
            serviceName: 'modeldb-ecs-service',
            publicLoadBalancer: true,
        });
        console.log(elbService.loadBalancer.loadBalancerSecurityGroups);
    }
}
exports.ECSStack = ECSStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWNzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQTJEO0FBRTNELDhDQUEwSTtBQUMxSSw4Q0FBOEg7QUFDOUgsZ0VBQTRFO0FBRTVFLHFDQUF5QztBQVF6QyxNQUFhLFFBQVMsU0FBUSxZQUFLO0lBYS9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUNwRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QiwyRUFBMkU7UUFDM0Usd0dBQXdHO1FBQ3hHLE1BQU07UUFDTixNQUFNLGVBQWUsR0FBRyxTQUFFLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDakUsTUFBTSxnQkFBZ0IsR0FBRyx1QkFBYSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRSxlQUFlLENBQUMsQ0FBQztRQUV2RyxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksaUJBQU8sQ0FBQyxJQUFJLEVBQUUsNkJBQTZCLEVBQUUsRUFBRSxHQUFHLEVBQUUsS0FBSyxDQUFDLEdBQUcsRUFBRSxDQUFDLENBQUM7UUFDcEYsSUFBSSxDQUFDLGFBQWEsR0FBRyxLQUFLLENBQUMsR0FBRyxDQUFDLGFBQWEsQ0FBQztZQUN6QyxVQUFVLEVBQUUsb0JBQVUsQ0FBQyxNQUFNO1NBQ2hDLENBQUMsQ0FBQztRQUNILE1BQU0sTUFBTSxHQUFHLElBQUksc0JBQWEsRUFBRSxDQUFDO1FBQ25DLElBQUksQ0FBQyxTQUFTLEdBQUcsSUFBSSxzQkFBWSxDQUFDO1lBQzlCLFlBQVksRUFBRSwwQkFBMEI7U0FDM0MsQ0FBQyxDQUFDO1FBRUgsSUFBSSxDQUFDLFVBQVUsR0FBRyxJQUFJLENBQUMsT0FBTyxDQUFDLFdBQVcsQ0FBQyx5QkFBeUIsRUFBRTtZQUNsRSxZQUFZLEVBQUUsc0JBQVksQ0FBQyxFQUFFLENBQUMsdUJB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QUFPLEVBQUUsRUFBRSxjQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFDOUQsZ0JBQWdCLENBQUMsY0FBYyxDQUFDLGNBQUksQ0FBQyxPQUFPLEVBQUUsRUFBRSxjQUFJLENBQUMsR0FBRyxDQUFDLEVBQUUsQ0FBQyxDQUFDLENBQUM7UUFFOUQsTUFBTSxVQUFVLEdBQUcsSUFBSSxvREFBaUMsQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDbEYsT0FBTyxFQUFFLElBQUksQ0FBQyxPQUFPO1lBQ3JCLGNBQWMsRUFBRSxJQUFJLENBQUMsY0FBYztZQUNuQyxZQUFZLEVBQUUsRUFBRTtZQUNoQixXQUFXLEVBQUUscUJBQXFCO1lBQ2xDLGtCQUFrQixFQUFFLElBQUk7U0FDM0IsQ0FBQyxDQUFDO1FBQ0gsT0FBTyxDQUFDLEdBQUcsQ0FBQyxVQUFVLENBQUMsWUFBWSxDQUFDLDBCQUEwQixDQUFDLENBQUM7SUFDcEUsQ0FBQztDQUNKO0FBek5ELDRCQXlOQyIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7IFN0YWNrLCBTdGFja1Byb3BzLCBGbiwgQXBwIH0gZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCB7IEF1dG9TY2FsaW5nR3JvdXAgfSBmcm9tICdAYXdzLWNkay9hd3MtYXV0b3NjYWxpbmcnXG5pbXBvcnQgeyBTdWJuZXRUeXBlLCBWcGMsIFN1Ym5ldFNlbGVjdGlvbiwgSW5zdGFuY2VUeXBlLCBJbnN0YW5jZUNsYXNzLCBJbnN0YW5jZVNpemUsIFNlY3VyaXR5R3JvdXAsIFBlZXIsIFBvcnQgfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWVjMlwiO1xuaW1wb3J0IHsgQXdzTG9nRHJpdmVyLCBFYzJUYXNrRGVmaW5pdGlvbiwgTmV0d29ya01vZGUsIENvbnRhaW5lckltYWdlLCBDbHVzdGVyLCBFYzJTZXJ2aWNlLCBQcm90b2NvbH0gZnJvbSAnQGF3cy1jZGsvYXdzLWVjcyc7XG5pbXBvcnQge0FwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRWMyU2VydmljZX0gZnJvbSAnQGF3cy1jZGsvYXdzLWVjcy1wYXR0ZXJucyc7XG5cbmltcG9ydCB7IENvbmZpZ09wdGlvbnMgfSBmcm9tICcuL2NvbmZpZyc7XG4vLyBpbXBvcnQgeyBTZWNyZXQgfSBmcm9tICdAYXdzLWNkay9hd3Mtc2VjcmV0c21hbmFnZXInO1xuXG5leHBvcnQgaW50ZXJmYWNlIEVDU1N0YWNrUHJvcHMgZXh0ZW5kcyBTdGFja1Byb3BzIHtcbiAgICB2cGM6IFZwYyxcbiAgICBkYlVzZXJuYW1lOiBzdHJpbmc7XG59XG5cbmV4cG9ydCBjbGFzcyBFQ1NTdGFjayBleHRlbmRzIFN0YWNrIHtcblxuICAgIHJlYWRvbmx5IGNsdXN0ZXI6IENsdXN0ZXI7XG4gICAgcmVhZG9ubHkgZWMyU2VydmljZTogRWMyU2VydmljZTtcbiAgICByZWFkb25seSBwdWJsaWNTdWJuZXRzOiBTdWJuZXRTZWxlY3Rpb247XG4gICAgcmVhZG9ubHkgY2x1c3RlckFTRzogQXV0b1NjYWxpbmdHcm91cDtcbiAgICByZWFkb25seSBpbnN0YW5jZVVzZXJEYXRhOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZWNzQ2x1c3RlclNlY3VyaXR5R3JvdXA6IFNlY3VyaXR5R3JvdXA7XG4gICAgcmVhZG9ubHkgY29udGFpbmVyU2VjdXJpdHlHcm91cDogU2VjdXJpdHlHcm91cDtcbiAgICByZWFkb25seSB0YXNrRGVmaW5pdGlvbjogRWMyVGFza0RlZmluaXRpb247XG4gICAgcmVhZG9ubHkgbG9nRHJpdmVyOiBBd3NMb2dEcml2ZXI7XG4gICAgXG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQXBwLCBpZDogc3RyaW5nLCBwcm9wczogRUNTU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcbiAgICAgICAgLy8gY29uc3QgZGJQYXNzd29yZCA9IFNlY3JldC5mcm9tU2VjcmV0QXR0cmlidXRlcyh0aGlzLCAnU2FtcGxlUGFzc3dvcmQnLCB7XG4gICAgICAgIC8vICAgICBzZWNyZXRBcm46ICdhcm46YXdzOnNlY3JldHNtYW5hZ2VyOntyZWdpb259OntvcmdhbmlzYXRpb24taWR9OnNlY3JldDptb2RlbGRiLXBvc3RncmVzcy1wYXNzd29yZCcsXG4gICAgICAgIC8vIH0pO1xuICAgICAgICBjb25zdCBhcHBsaWNhdGlvblNHSWQgPSBGbi5pbXBvcnRWYWx1ZSgnbW9kZWxkYi1hcHBsaWNhdGlvbi1zZycpO1xuICAgICAgICBjb25zdCBhcHBTZWN1cml0eUdyb3VwID0gU2VjdXJpdHlHcm91cC5mcm9tU2VjdXJpdHlHcm91cElkKHRoaXMsICdlYzItU2VjdXJpdHlHcm91cCcsIGFwcGxpY2F0aW9uU0dJZCk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgQ2x1c3Rlcih0aGlzLCAnYXdzdnBjLXZlcnRhLWFpLWVjcy1jbHVzdGVyJywgeyB2cGM6IHByb3BzLnZwYyB9KTtcbiAgICAgICAgdGhpcy5wdWJsaWNTdWJuZXRzID0gcHJvcHMudnBjLnNlbGVjdFN1Ym5ldHMoe1xuICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QVUJMSUNcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWdPcHRpb25zKCk7XG4gICAgICAgIHRoaXMubG9nRHJpdmVyID0gbmV3IEF3c0xvZ0RyaXZlcih7XG4gICAgICAgICAgICBzdHJlYW1QcmVmaXg6IFwidmVydGEtYWktYXdzLWVjcy1zZXJ2aWNlXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY2x1c3RlckFTRyA9IHRoaXMuY2x1c3Rlci5hZGRDYXBhY2l0eSgnRGVmYXVsdEF1dG9TY2FsaW5nR3JvdXAnLCB7XG4gICAgICAgICAgICBpbnN0YW5jZVR5cGU6IEluc3RhbmNlVHlwZS5vZihJbnN0YW5jZUNsYXNzLlQyLCBJbnN0YW5jZVNpemUuTUlDUk8pLFxuICAgICAgICAgICAga2V5TmFtZTogJ2RhdGFmeS1rZXlwYWlyJyxcbiAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHRoaXMucHVibGljU3VibmV0cyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGRiVXJsID0gRm4uaW1wb3J0VmFsdWUoJ21vZGVsZGItcmRzLXVybCcpO1xuICAgICAgICBjb25zdCB0ZXN0UGFzcyA9ICd0ZXN0cGFzc3dvcmQnXG4gICAgICAgIHRoaXMuaW5zdGFuY2VVc2VyRGF0YSA9IGBcbiMhL2Jpbi9iYXNoXG5ta2RpciAtcCAvZWNzL2JhY2tlbmQvY29uZmlnL1xuY2F0IDw8PCAnXG4jVGhpcyBjb25maWcgaXMgdXNlZCBieSBkb2NrZXIgY29tcG9zZS5cbiNNb2RlbERCIFByb3BlcnRpZXNcbmdycGNTZXJ2ZXI6XG4gIHBvcnQ6IDgwODVcblxuc3ByaW5nU2VydmVyOlxuICBwb3J0OiA4MDg2XG4gIHNodXRkb3duVGltZW91dDogMzAgI3RpbWUgaW4gc2Vjb25kXG5cbmFydGlmYWN0U3RvcmVDb25maWc6XG4gIGFydGlmYWN0U3RvcmVUeXBlOiBORlMgI1MzLCBHQ1AsIE5GU1xuICBORlM6XG4gICAgbmZzVXJsUHJvdG9jb2w6IGh0dHBcbiAgICBuZnNSb290UGF0aDogL2FydGlmYWN0LXN0b3JlL1xuICAgIGFydGlmYWN0RW5kcG9pbnQ6XG4gICAgICBnZXRBcnRpZmFjdDogXCJhcGkvdjEvYXJ0aWZhY3QvZ2V0QXJ0aWZhY3RcIlxuICAgICAgc3RvcmVBcnRpZmFjdDogXCJhcGkvdjEvYXJ0aWZhY3Qvc3RvcmVBcnRpZmFjdFwiXG5cbiMgRGF0YWJhc2Ugc2V0dGluZ3MgKHR5cGUgbW9uZ29kYiwgY291Y2hiYXNlZGIsIHJlbGF0aW9uYWwgZXRjLi4pXG5kYXRhYmFzZTpcbiAgREJUeXBlOiByZWxhdGlvbmFsXG4gIHRpbWVvdXQ6IDRcbiAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgUmRiRGF0YWJhc2VOYW1lOiBwb3N0Z3Jlc1xuICAgIFJkYkRyaXZlcjogXCJvcmcucG9zdGdyZXNxbC5Ecml2ZXJcIlxuICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICBSZGJVcmw6IFwiJHtkYlVybH1cIlxuICAgIFJkYlVzZXJuYW1lOiBcIiR7cHJvcHMuZGJVc2VybmFtZX1cIlxuICAgIFJkYlBhc3N3b3JkOiBcIiR7dGVzdFBhc3N9XCJcblxuIyBUZXN0IERhdGFiYXNlIHNldHRpbmdzICh0eXBlIG1vbmdvZGIsIGNvdWNoYmFzZWRiIGV0Yy4uKVxudGVzdDpcbiAgdGVzdC1kYXRhYmFzZTpcbiAgICBEQlR5cGU6IHJlbGF0aW9uYWxcbiAgICB0aW1lb3V0OiA0XG4gICAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gICAgUmRiQ29uZmlndXJhdGlvbjpcbiAgICAgIFJkYkRhdGFiYXNlTmFtZTogcG9zdGdyZXNcbiAgICAgIFJkYkRyaXZlcjogXCJvcmcucG9zdGdyZXNxbC5Ecml2ZXJcIlxuICAgICAgUmRiRGlhbGVjdDogXCJvcmcuaGliZXJuYXRlLmRpYWxlY3QuUG9zdGdyZVNRTERpYWxlY3RcIlxuICAgICAgUmRiVXJsOiBcImpkYmM6cG9zdGdyZXNxbDovL21vZGVsZGItcG9zdGdyZXM6NTQzMlwiXG4gICAgICBSZGJVc2VybmFtZTogcG9zdGdyZXNcbiAgICAgIFJkYlBhc3N3b3JkOiByb290XG5cbiNBcnRpZmFjdFN0b3JlIFByb3BlcnRpZXNcbmFydGlmYWN0U3RvcmVfZ3JwY1NlcnZlcjpcbiAgaG9zdDogbW9kZWxkYi1iYWNrZW5kXG4gIHBvcnQ6IDgwODZcblxudGVsZW1ldHJ5OlxuICBvcHRfaW46IHRydWVcbiAgZnJlcXVlbmN5OiAxICNmcmVxdWVuY3kgdG8gc2hhcmUgZGF0YSBpbiBob3VycywgZGVmYXVsdCAxXG4gIGNvbnN1bWVyOiBodHRwczovL2FwcC52ZXJ0YS5haS9hcGkvdjEvdWFjLXByb3h5L3RlbGVtZXRyeS9jb2xsZWN0VGVsZW1ldHJ5JyA+IC9lY3MvYmFja2VuZC9jb25maWcvY29uZmlnLnlhbWxgO1xuICAgICAgICB0aGlzLmNsdXN0ZXJBU0cuYWRkVXNlckRhdGEodGhpcy5pbnN0YW5jZVVzZXJEYXRhKTtcbiAgICAgICAgXG4gICAgICAgIGFwcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDIyKSlcbiAgICAgICAgdGhpcy5jbHVzdGVyQVNHLmFkZFNlY3VyaXR5R3JvdXAoYXBwU2VjdXJpdHlHcm91cCk7XG5cbiAgICAgICAgdGhpcy50YXNrRGVmaW5pdGlvbiA9IG5ldyBFYzJUYXNrRGVmaW5pdGlvbih0aGlzLCAnbW9kZWxkYi1hd3NwdmMnLCB7XG4gICAgICAgICAgICBuZXR3b3JrTW9kZTogTmV0d29ya01vZGUuQVdTX1ZQQyxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYXJ0aWZhY3Qtc3RvcmUnLFxuICAgICAgICAgICAgICAgIGhvc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlUGF0aDogJy9lY3MvYXJ0aWZhY3Qtc3RvcmUnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApXG4gICAgICAgIFxuICAgICAgICB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnY29uZmlnJyxcbiAgICAgICAgICAgICAgICBob3N0OiB7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZVBhdGg6ICcvZWNzL2JhY2tlbmQvY29uZmlnJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICBjb25zdCBtb2RlbGRiRnJvbnRlbmQgPSB0aGlzLnRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignbW9kZWxkYi1mcm9udGVuZCcsIHtcbiAgICAgICAgICAgIGltYWdlOiBDb250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoY29uZmlnLnZlcnRhQUlJbWFnZXMuTW9kZWxEQkZyb250ZW5kKSxcbiAgICAgICAgICAgIGNwdTogMTAwLFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgICAgIGVzc2VudGlhbDogdHJ1ZSwgXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIERFUExPWUVEOiBcInllc1wiLFxuICAgICAgICAgICAgICAgIEJBQ0tFTkRfQVBJX1BST1RPQ09MOiBcImh0dHBcIixcbiAgICAgICAgICAgICAgICBCQUNLRU5EX0FQSV9ET01BSU46IFwibW9kZWxkYi1wcm94eTo4MDgwXCIsXG4gICAgICAgICAgICAgICAgTURCX0FERFJFU1M6IFwiaHR0cDovL21vZGVsZGItcHJveHk6ODA4MFwiLFxuICAgICAgICAgICAgICAgIEFSVElGQUNUT1JZX0FERFJFU1M6IFwiaHR0cDovL21vZGVsZGItYmFja2VuZDo4MDg2XCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dnaW5nOiB0aGlzLmxvZ0RyaXZlclxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIC8vIGRlZmluZSBjb250YWluZXJzIGJlbG93XG4gICAgICAgIGNvbnN0IG1vZGVsZGJCYWNrZW5kID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ21vZGVsZGItYmFja2VuZCcsIHtcbiAgICAgICAgICAgIGltYWdlOiBDb250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoY29uZmlnLnZlcnRhQUlJbWFnZXMuTW9kZWxEQkJhY2tFbmQpLFxuICAgICAgICAgICAgY3B1OiAxMDAsXG4gICAgICAgICAgICBtZW1vcnlMaW1pdE1pQjogMjU2LFxuICAgICAgICAgICAgZXNzZW50aWFsOiB0cnVlLCAgICBcbiAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgVkVSVEFfTU9ERUxEQl9DT05GSUc6ICcvY29uZmlnL2NvbmZpZy55YW1sJ1xuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvZ2dpbmc6IHRoaXMubG9nRHJpdmVyXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgbW9kZWxkYkJhY2tlbmQuYWRkTW91bnRQb2ludHMoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc291cmNlVm9sdW1lOiAnYXJ0aWZhY3Qtc3RvcmUnLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvYXJ0aWZhY3Qtc3RvcmUvJyxcbiAgICAgICAgICAgICAgICByZWFkT25seTogZmFsc2VcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgc291cmNlVm9sdW1lOiAnY29uZmlnJyxcbiAgICAgICAgICAgICAgICBjb250YWluZXJQYXRoOiAnL2NvbmZpZy8nLFxuICAgICAgICAgICAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIGNvbnN0IG1vZGVsZGJQcm94eSA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdtb2RlbGRiLXByb3h5Jywge1xuICAgICAgICAgICAgaW1hZ2U6IENvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShjb25maWcudmVydGFBSUltYWdlcy5Nb2RlbERCUHJveHkpLFxuICAgICAgICAgICAgY3B1OiAxMDAsXG4gICAgICAgICAgICBtZW1vcnlMaW1pdE1pQjogMjU2LFxuICAgICAgICAgICAgZXNzZW50aWFsOiB0cnVlLCAgICBcbiAgICAgICAgICAgIGVudmlyb25tZW50OiB7XG4gICAgICAgICAgICAgICAgTURCX0FERFJFU1M6IFwibW9kZWxkYi1iYWNrZW5kOjgwODVcIixcbiAgICAgICAgICAgICAgICBTRVJWRVJfSFRUUF9QT1JUOiBcIjgwODBcIlxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIGxvZ2dpbmc6IHRoaXMubG9nRHJpdmVyXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG1vZGVsZGJGcm9udGVuZC5hZGRQb3J0TWFwcGluZ3MoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyUG9ydDogODAsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwLFxuICAgICAgICAgICAgICAgIHByb3RvY29sOiBQcm90b2NvbC5UQ1AsXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgbW9kZWxkYkJhY2tlbmQuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODUsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODUsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCxcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyUG9ydDogODA4NixcbiAgICAgICAgICAgICAgICBob3N0UG9ydDogODA4NixcbiAgICAgICAgICAgICAgICBwcm90b2NvbDogUHJvdG9jb2wuVENQLCBcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICBtb2RlbGRiUHJveHkuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICBhcHBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCg4MDg1KSk7XG4gICAgICAgIGFwcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDgwODYpKTtcbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoMjIpKTtcbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoODApKTtcblxuICAgICAgICBjb25zdCBlbGJTZXJ2aWNlID0gbmV3IEFwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRWMyU2VydmljZSh0aGlzLCAnbW9kZWxkYi1lY3Mtc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IHRoaXMuY2x1c3RlcixcbiAgICAgICAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLnRhc2tEZWZpbml0aW9uLFxuICAgICAgICAgICAgbGlzdGVuZXJQb3J0OiA4MCxcbiAgICAgICAgICAgIHNlcnZpY2VOYW1lOiAnbW9kZWxkYi1lY3Mtc2VydmljZScsXG4gICAgICAgICAgICBwdWJsaWNMb2FkQmFsYW5jZXI6IHRydWUsXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zb2xlLmxvZyhlbGJTZXJ2aWNlLmxvYWRCYWxhbmNlci5sb2FkQmFsYW5jZXJTZWN1cml0eUdyb3Vwcyk7XG4gICAgfVxufSJdfQ==