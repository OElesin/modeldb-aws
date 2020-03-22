"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_ecs_1 = require("@aws-cdk/aws-ecs");
const aws_ecs_patterns_1 = require("@aws-cdk/aws-ecs-patterns");
const aws_servicediscovery_1 = require("@aws-cdk/aws-servicediscovery");
const AWS = require("aws-sdk");
const config_1 = require("./config");
class ECSStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const serviceDiscoveryName = 'modeldb-cluster-aws.com';
        const modeldbBackendDiscoveryName = 'backend';
        const modeldbBackendDiscoveryDns = 'localhost'; //`${modeldbBackendDiscoveryName}.${serviceDiscoveryName}`;
        const modeldbProxyDiscoveryDns = 'localhost'; // `proxy.${serviceDiscoveryName}`
        const applicationSGId = core_1.Fn.importValue('modeldb-application-sg');
        const appSecurityGroup = aws_ec2_1.SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', applicationSGId);
        // CloudMap Namespace
        this.cloudMapNamespace = new aws_servicediscovery_1.PrivateDnsNamespace(this, 'modeldb-namespace', {
            vpc: props.vpc,
            name: serviceDiscoveryName
        });
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
            instanceType: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.M4, aws_ec2_1.InstanceSize.XLARGE),
            keyName: 'datafy-keypair',
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
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        this.clusterASG.addSecurityGroup(appSecurityGroup);
        this.modelDBBackendtaskDefinition = new aws_ecs_1.Ec2TaskDefinition(this, 'modeldb-awspvc', {
            networkMode: aws_ecs_1.NetworkMode.AWS_VPC,
        });
        this.modelDBBackendtaskDefinition.addVolume({
            name: 'artifact-store',
            host: {
                sourcePath: '/ecs/artifact-store'
            }
        });
        this.modelDBBackendtaskDefinition.addVolume({
            name: 'config',
            host: {
                sourcePath: '/ecs/backend/config'
            }
        });
        // define containers below
        const modeldbBackend = this.modelDBBackendtaskDefinition.addContainer('modeldb-backend', {
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
            containerPort: 8086,
            protocol: aws_ecs_1.Protocol.TCP,
        }, {
            containerPort: 8085,
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
        // Create the backend service
        this.backEndService = new aws_ecs_1.Ec2Service(this, 'modeldb-backend-service', {
            cluster: this.cluster,
            taskDefinition: this.modelDBBackendtaskDefinition,
            serviceName: 'modeldb-backend-service',
            assignPublicIp: false,
            securityGroup: appSecurityGroup,
            vpcSubnets: this.publicSubnets,
        });
        this.modelDBProxytaskDefinition = new aws_ecs_1.Ec2TaskDefinition(this, 'modeldb-proxy-task', {
            networkMode: aws_ecs_1.NetworkMode.AWS_VPC,
        });
        const modeldbProxy = this.modelDBProxytaskDefinition.addContainer('modeldb-proxy', {
            image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBProxy),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,
            environment: {
                MDB_ADDRESS: `${modeldbBackendDiscoveryDns}:8086`,
                SERVER_HTTP_PORT: "8080"
            },
            logging: this.logDriver
        });
        modeldbProxy.addPortMappings({
            containerPort: 8080,
            protocol: aws_ecs_1.Protocol.TCP,
        });
        // create proxy service
        this.proxyEndService = new aws_ecs_1.Ec2Service(this, 'modeldb-proxy-service', {
            cluster: this.cluster,
            taskDefinition: this.modelDBProxytaskDefinition,
            serviceName: 'modeldb-proxy-service',
            assignPublicIp: false,
            securityGroup: appSecurityGroup,
            vpcSubnets: this.publicSubnets,
        });
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8085));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8086));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        appSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8080));
        this.modelDBFrontendtaskDefinition = new aws_ecs_1.Ec2TaskDefinition(this, 'modeldb-frontend-task', {
            networkMode: aws_ecs_1.NetworkMode.AWS_VPC,
        });
        const frontEnd = this.modelDBFrontendtaskDefinition.addContainer('modeldb-frontend', {
            image: aws_ecs_1.ContainerImage.fromRegistry(config.vertaAIImages.ModelDBFrontend),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,
            logging: this.logDriver,
            environment: {
                DEPLOYED: "yes",
                BACKEND_API_PROTOCOL: "http",
                BACKEND_API_DOMAIN: `${modeldbProxyDiscoveryDns}:8080`,
                MDB_ADDRESS: `http://${modeldbProxyDiscoveryDns}:8080`,
                ARTIFACTORY_ADDRESS: `http://${modeldbBackendDiscoveryDns}:8086`
            },
        });
        frontEnd.addPortMappings({
            containerPort: 3000,
            protocol: aws_ecs_1.Protocol.TCP,
        });
        new aws_ecs_patterns_1.ApplicationLoadBalancedEc2Service(this, 'modeldb-ecs-service', {
            cluster: this.cluster,
            listenerPort: 80,
            cpu: 100,
            taskDefinition: this.modelDBFrontendtaskDefinition,
            publicLoadBalancer: true,
            memoryLimitMiB: 256,
            serviceName: 'modeldb-frontend-service',
        });
        this.backEndService.enableCloudMap({
            dnsRecordType: aws_servicediscovery_1.DnsRecordType.A,
            failureThreshold: 1,
            cloudMapNamespace: this.cloudMapNamespace,
            name: modeldbBackendDiscoveryName,
            dnsTtl: core_1.Duration.minutes(5)
        });
        this.proxyEndService.enableCloudMap({
            dnsRecordType: aws_servicediscovery_1.DnsRecordType.A,
            failureThreshold: 1,
            cloudMapNamespace: this.cloudMapNamespace,
            name: 'proxy',
            dnsTtl: core_1.Duration.minutes(5)
        });
    }
}
exports.ECSStack = ECSStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWNzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQXFFO0FBRXJFLDhDQUEwSTtBQUMxSSw4Q0FBOEg7QUFDOUgsZ0VBQTRFO0FBQzVFLHdFQUFpRjtBQUNqRiwrQkFBK0I7QUFDL0IscUNBQXlDO0FBUXpDLE1BQWEsUUFBUyxTQUFRLFlBQUs7SUFpQi9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUNwRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUV4QixNQUFNLG9CQUFvQixHQUFHLHlCQUF5QixDQUFDO1FBQ3ZELE1BQU0sMkJBQTJCLEdBQUcsU0FBUyxDQUFDO1FBQzlDLE1BQU0sMEJBQTBCLEdBQUcsV0FBVyxDQUFDLENBQUEsMkRBQTJEO1FBQzFHLE1BQU0sd0JBQXdCLEdBQUcsV0FBVyxDQUFDLENBQUEsa0NBQWtDO1FBQy9FLE1BQU0sZUFBZSxHQUFHLFNBQUUsQ0FBQyxXQUFXLENBQUMsd0JBQXdCLENBQUMsQ0FBQztRQUNqRSxNQUFNLGdCQUFnQixHQUFHLHVCQUFhLENBQUMsbUJBQW1CLENBQUMsSUFBSSxFQUFFLG1CQUFtQixFQUFFLGVBQWUsQ0FBQyxDQUFDO1FBRXZHLHFCQUFxQjtRQUNyQixJQUFJLENBQUMsaUJBQWlCLEdBQUcsSUFBSSwwQ0FBbUIsQ0FBQyxJQUFJLEVBQUUsbUJBQW1CLEVBQUU7WUFDeEUsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsSUFBSSxFQUFFLG9CQUFvQjtTQUM3QixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsT0FBTyxHQUFHLElBQUksaUJBQU8sQ0FBQyxJQUFJLEVBQUUscUJBQXFCLEVBQUU7WUFDcEQsR0FBRyxFQUFFLEtBQUssQ0FBQyxHQUFHO1lBQ2QsV0FBVyxFQUFFLHFCQUFxQjtTQUNyQyxDQUFDLENBQUM7UUFDSCxJQUFJLENB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R0FBRztZQUNSLGNBQWMsRUFBRSxJQUFJLENBQUMsNkJBQTZCO1lBQ2xELGtCQUFrQixFQUFFLElBQUk7WUFDeEIsY0FBYyxFQUFFLEdBQUc7WUFDbkIsV0FBVyxFQUFFLDBCQUEwQjtTQUMxQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsY0FBYyxDQUFDLGNBQWMsQ0FBQztZQUMvQixhQUFhLEVBQUUsb0NBQWEsQ0FBQyxDQUFDO1lBQzlCLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtZQUN6QyxJQUFJLEVBQUUsMkJBQTJCO1lBQ2pDLE1BQU0sRUFBRSxlQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztTQUM5QixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZUFBZSxDQUFDLGNBQWMsQ0FBQztZQUNoQyxhQUFhLEVBQUUsb0NBQWEsQ0FBQyxDQUFDO1lBQzlCLGdCQUFnQixFQUFFLENBQUM7WUFDbkIsaUJBQWlCLEVBQUUsSUFBSSxDQUFDLGlCQUFpQjtZQUN6QyxJQUFJLEVBQUUsT0FBTztZQUNiLE1BQU0sRUFBRSxlQUFRLENBQUMsT0FBTyxDQUFDLENBQUMsQ0FBQztTQUM5QixDQUFDLENBQUM7SUFFUCxDQUFDO0NBQ0o7QUFqU0QsNEJBaVNDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgU3RhY2ssIFN0YWNrUHJvcHMsIEZuLCBBcHAsIER1cmF0aW9uIH0gZnJvbSBcIkBhd3MtY2RrL2NvcmVcIjtcbmltcG9ydCB7IEF1dG9TY2FsaW5nR3JvdXAgfSBmcm9tICdAYXdzLWNkay9hd3MtYXV0b3NjYWxpbmcnXG5pbXBvcnQgeyBTdWJuZXRUeXBlLCBWcGMsIFN1Ym5ldFNlbGVjdGlvbiwgSW5zdGFuY2VUeXBlLCBJbnN0YW5jZUNsYXNzLCBJbnN0YW5jZVNpemUsIFNlY3VyaXR5R3JvdXAsIFBlZXIsIFBvcnQgfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWVjMlwiO1xuaW1wb3J0IHsgQXdzTG9nRHJpdmVyLCBFYzJUYXNrRGVmaW5pdGlvbiwgTmV0d29ya01vZGUsIENvbnRhaW5lckltYWdlLCBDbHVzdGVyLCBFYzJTZXJ2aWNlLCBQcm90b2NvbH0gZnJvbSAnQGF3cy1jZGsvYXdzLWVjcyc7XG5pbXBvcnQge0FwcGxpY2F0aW9uTG9hZEJhbGFuY2VkRWMyU2VydmljZX0gZnJvbSAnQGF3cy1jZGsvYXdzLWVjcy1wYXR0ZXJucyc7XG5pbXBvcnQge1ByaXZhdGVEbnNOYW1lc3BhY2UsIERuc1JlY29yZFR5cGV9IGZyb20gJ0Bhd3MtY2RrL2F3cy1zZXJ2aWNlZGlzY292ZXJ5JztcbmltcG9ydCAqIGFzIEFXUyBmcm9tICdhd3Mtc2RrJztcbmltcG9ydCB7IENvbmZpZ09wdGlvbnMgfSBmcm9tICcuL2NvbmZpZyc7XG5cblxuZXhwb3J0IGludGVyZmFjZSBFQ1NTdGFja1Byb3BzIGV4dGVuZHMgU3RhY2tQcm9wcyB7XG4gICAgdnBjOiBWcGMsXG4gICAgZGJVc2VybmFtZTogc3RyaW5nO1xufVxuXG5leHBvcnQgY2xhc3MgRUNTU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG5cbiAgICByZWFkb25seSBjbHVzdGVyOiBDbHVzdGVyO1xuICAgIHJlYWRvbmx5IGJhY2tFbmRTZXJ2aWNlOiBFYzJTZXJ2aWNlO1xuICAgIHJlYWRvbmx5IHByb3h5RW5kU2VydmljZTogRWMyU2VydmljZTtcbiAgICByZWFkb25seSBwdWJsaWNTdWJuZXRzOiBTdWJuZXRTZWxlY3Rpb247XG4gICAgcmVhZG9ubHkgY2x1c3RlckFTRzogQXV0b1NjYWxpbmdHcm91cDtcbiAgICByZWFkb25seSBpbnN0YW5jZVVzZXJEYXRhOiBzdHJpbmc7XG4gICAgcmVhZG9ubHkgZWNzQ2x1c3RlclNlY3VyaXR5R3JvdXA6IFNlY3VyaXR5R3JvdXA7XG4gICAgcmVhZG9ubHkgY29udGFpbmVyU2VjdXJpdHlHcm91cDogU2VjdXJpdHlHcm91cDtcbiAgICByZWFkb25seSBtb2RlbERCQmFja2VuZHRhc2tEZWZpbml0aW9uOiBFYzJUYXNrRGVmaW5pdGlvbjtcbiAgICByZWFkb25seSBtb2RlbERCUHJveHl0YXNrRGVmaW5pdGlvbjogRWMyVGFza0RlZmluaXRpb247XG4gICAgcmVhZG9ubHkgbW9kZWxEQkZyb250ZW5kdGFza0RlZmluaXRpb246IEVjMlRhc2tEZWZpbml0aW9uO1xuICAgIHJlYWRvbmx5IGxvZ0RyaXZlcjogQXdzTG9nRHJpdmVyO1xuICAgIHJlYWRvbmx5IGNsb3VkTWFwTmFtZXNwYWNlOiBQcml2YXRlRG5zTmFtZXNwYWNlO1xuICAgIFxuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IEFwcCwgaWQ6IHN0cmluZywgcHJvcHM6IEVDU1N0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgICAgIFxuICAgICAgICBjb25zdCBzZXJ2aWNlRGlzY292ZXJ5TmFtZSA9ICdtb2RlbGRiLWNsdXN0ZXItYXdzLmNvbSc7XG4gICAgICAgIGNvbnN0IG1vZGVsZGJCYWNrZW5kRGlzY292ZXJ5TmFtZSA9ICdiYWNrZW5kJztcbiAgICAgICAgY29uc3QgbW9kZWxkYkJhY2tlbmREaXNjb3ZlcnlEbnMgPSAnbG9jYWxob3N0JzsvL2Ake21vZGVsZGJCYWNrZW5kRGlzY292ZXJ5TmFtZX0uJHtzZXJ2aWNlRGlzY292ZXJ5TmFtZX1gO1xuICAgICAgICBjb25zdCBtb2RlbGRiUHJveHlEaXNjb3ZlcnlEbnMgPSAnbG9jYWxob3N0JzsvLyBgcHJveHkuJHtzZXJ2aWNlRGlzY292ZXJ5TmFtZX1gXG4gICAgICAgIGNvbnN0IGFwcGxpY2F0aW9uU0dJZCA9IEZuLmltcG9ydFZhbHVlKCdtb2RlbGRiLWFwcGxpY2F0aW9uLXNnJyk7XG4gICAgICAgIGNvbnN0IGFwcFNlY3VyaXR5R3JvdXAgPSBTZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ2VjMi1TZWN1cml0eUdyb3VwJywgYXBwbGljYXRpb25TR0lkKTtcbiAgICAgICAgXG4gICAgICAgIC8vIENsb3VkTWFwIE5hbWVzcGFjZVxuICAgICAgICB0aGlzLmNsb3VkTWFwTmFtZXNwYWNlID0gbmV3IFByaXZhdGVEbnNOYW1lc3BhY2UodGhpcywgJ21vZGVsZGItbmFtZXNwYWNlJywge1xuICAgICAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgICAgICBuYW1lOiBzZXJ2aWNlRGlzY292ZXJ5TmFtZVxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgQ2x1c3Rlcih0aGlzLCAnbW9kZWxkYi1lY3MtY2x1c3RlcicsIHsgXG4gICAgICAgICAgICB2cGM6IHByb3BzLnZwYyxcbiAgICAgICAgICAgIGNsdXN0ZXJOYW1lOiAnbW9kZWxkYi1lY3MtY2x1c3RlcidcbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMucHVibGljU3VibmV0cyA9IHByb3BzLnZwYy5zZWxlY3RTdWJuZXRzKHtcbiAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFVCTElDXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBjb25maWcgPSBuZXcgQ29uZmlnT3B0aW9ucygpO1xuICAgICAgICB0aGlzLmxvZ0RyaXZlciA9IG5ldyBBd3NMb2dEcml2ZXIoe1xuICAgICAgICAgICAgc3RyZWFtUHJlZml4OiBcInZlcnRhLWFpLWF3cy1lY3Mtc2VydmljZVwiLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLmNsdXN0ZXJBU0cgPSB0aGlzLmNsdXN0ZXIuYWRkQ2FwYWNpdHkoJ0RlZmF1bHRBdXRvU2NhbGluZ0dyb3VwJywge1xuICAgICAgICAgICAgaW5zdGFuY2VUeXBlOiBJbnN0YW5jZVR5cGUub2YoSW5zdGFuY2VDbGFzcy5NNCwgSW5zdGFuY2VTaXplLlhMQVJHRSksXG4gICAgICAgICAgICBrZXlOYW1lOiAnZGF0YWZ5LWtleXBhaXInLFxuICAgICAgICAgICAgdnBjU3VibmV0czogdGhpcy5wdWJsaWNTdWJuZXRzLFxuICAgICAgICB9KTtcbiAgICAgICAgY29uc3QgZGJVcmwgPSBGbi5pbXBvcnRWYWx1ZSgnbW9kZWxkYi1yZHMtdXJsJyk7XG4gICAgICAgIHRoaXMuaW5zdGFuY2VVc2VyRGF0YSA9IGBcbiMhL2Jpbi9iYXNoXG5ta2RpciAtcCAvZWNzL2JhY2tlbmQvY29uZmlnL1xuY2F0IDw8PCAnXG4jVGhpcyBjb25maWcgaXMgdXNlZCBieSBkb2NrZXIgY29tcG9zZS5cbiNNb2RlbERCIFByb3BlcnRpZXNcbmdycGNTZXJ2ZXI6XG4gIHBvcnQ6IDgwODVcblxuc3ByaW5nU2VydmVyOlxuICBwb3J0OiA4MDg2XG4gIHNodXRkb3duVGltZW91dDogMzAgI3RpbWUgaW4gc2Vjb25kXG5cbmFydGlmYWN0U3RvcmVDb25maWc6XG4gIGFydGlmYWN0U3RvcmVUeXBlOiBORlMgI1MzLCBHQ1AsIE5GU1xuICBORlM6XG4gICAgbmZzVXJsUHJvdG9jb2w6IGh0dHBcbiAgICBuZnNSb290UGF0aDogL2FydGlmYWN0LXN0b3JlL1xuICAgIGFydGlmYWN0RW5kcG9pbnQ6XG4gICAgICBnZXRBcnRpZmFjdDogXCJhcGkvdjEvYXJ0aWZhY3QvZ2V0QXJ0aWZhY3RcIlxuICAgICAgc3RvcmVBcnRpZmFjdDogXCJhcGkvdjEvYXJ0aWZhY3Qvc3RvcmVBcnRpZmFjdFwiXG5cbiMgRGF0YWJhc2Ugc2V0dGluZ3MgKHR5cGUgbW9uZ29kYiwgY291Y2hiYXNlZGIsIHJlbGF0aW9uYWwgZXRjLi4pXG5kYXRhYmFzZTpcbiAgREJUeXBlOiByZWxhdGlvbmFsXG4gIHRpbWVvdXQ6IDRcbiAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgUmRiRGF0YWJhc2VOYW1lOiBwb3N0Z3Jlc1xuICAgIFJkYkRyaXZlcjogXCJvcmcucG9zdGdyZXNxbC5Ecml2ZXJcIlxuICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICBSZGJVcmw6IFwiJHtkYlVybH1cIlxuICAgIFJkYlVzZXJuYW1lOiBcIiR7cHJvcHMuZGJVc2VybmFtZX1cIlxuICAgIFJkYlBhc3N3b3JkOiBcIiNkYlBhc3N3b3JkXCJcblxuIyBUZXN0IERhdGFiYXNlIHNldHRpbmdzICh0eXBlIG1vbmdvZGIsIGNvdWNoYmFzZWRiIGV0Yy4uKVxudGVzdDpcbiAgdGVzdC1kYXRhYmFzZTpcbiAgICBEQlR5cGU6IHJlbGF0aW9uYWxcbiAgICB0aW1lb3V0OiA0XG4gICAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gICAgUmRiQ29uZmlndXJhdGlvbjpcbiAgICAgIFJkYkRhdGFiYXNlTmFtZTogcG9zdGdyZXNcbiAgICAgIFJkYkRyaXZlcjogXCJvcmcucG9zdGdyZXNxbC5Ecml2ZXJcIlxuICAgICAgUmRiRGlhbGVjdDogXCJvcmcuaGliZXJuYXRlLmRpYWxlY3QuUG9zdGdyZVNRTERpYWxlY3RcIlxuICAgICAgUmRiVXJsOiBcImpkYmM6cG9zdGdyZXNxbDovL21vZGVsZGItcG9zdGdyZXM6NTQzMlwiXG4gICAgICBSZGJVc2VybmFtZTogcG9zdGdyZXNcbiAgICAgIFJkYlBhc3N3b3JkOiByb290XG5cbiNBcnRpZmFjdFN0b3JlIFByb3BlcnRpZXNcbmFydGlmYWN0U3RvcmVfZ3JwY1NlcnZlcjpcbiAgaG9zdDogbW9kZWxkYi1iYWNrZW5kXG4gIHBvcnQ6IDgwODZcblxudGVsZW1ldHJ5OlxuICBvcHRfaW46IHRydWVcbiAgZnJlcXVlbmN5OiAxICNmcmVxdWVuY3kgdG8gc2hhcmUgZGF0YSBpbiBob3VycywgZGVmYXVsdCAxXG4gIGNvbnN1bWVyOiBodHRwczovL2FwcC52ZXJ0YS5haS9hcGkvdjEvdWFjLXByb3h5L3RlbGVtZXRyeS9jb2xsZWN0VGVsZW1ldHJ5JyA+IC9lY3MvYmFja2VuZC9jb25maWcvY29uZmlnLnlhbWxgO1xuICAgICAgICBcbiAgICAgICAgY29uc3Qgc2VjcmV0c21hbmFnZXIgPSBuZXcgQVdTLlNlY3JldHNNYW5hZ2VyKCk7XG4gICAgICAgIGxldCBfc2VsZiA9IHRoaXM7XG4gICAgICAgIGxldCBfcGFyYW1zID0ge1xuICAgICAgICAgICAgU2VjcmV0SWQ6IFwibW9kZWxkYi1wb3N0Z3Jlcy1jZGJcIiwgXG4gICAgICAgICAgICBWZXJzaW9uU3RhZ2U6IFwiQVdTQ1VSUkVOVFwiXG4gICAgICAgIH1cbiAgICAgICAgc2VjcmV0c21hbmFnZXIuZ2V0U2VjcmV0VmFsdWUoX3BhcmFtcywgZnVuY3Rpb24oZXJyb3IsIGRhdGEpe1xuICAgICAgICAgICAgaWYgKGVycm9yKSBjb25zb2xlLmxvZyhlcnJvciwgZXJyb3Iuc3RhY2spO1xuICAgICAgICAgICAgZWxzZSB7XG4gICAgICAgICAgICAgICAgbGV0IHNlY3VyZVN0cmluZyA9IGRhdGFbJ1NlY3JldFN0cmluZyddO1xuICAgICAgICAgICAgICAgIGxldCBzZWN1cmVTdHJpbmdPYmogPSBKU09OLnBhcnNlKFN0cmluZyhzZWN1cmVTdHJpbmcpKTtcbiAgICAgICAgICAgICAgICBsZXQgcGFzc3dvcmQgPSBzZWN1cmVTdHJpbmdPYmpbJ3Bhc3N3b3JkJ11cbiAgICAgICAgICAgICAgICBsZXQgdXNlckRhdGEgPSBfc2VsZi5pbnN0YW5jZVVzZXJEYXRhLnJlcGxhY2UoJyNkYlBhc3N3b3JkJywgcGFzc3dvcmQpO1xuICAgICAgICAgICAgICAgIF9zZWxmLmNsdXN0ZXJBU0cuYWRkVXNlckRhdGEodXNlckRhdGEpOyBcbiAgICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoMjIpKVxuICAgICAgICB0aGlzLmNsdXN0ZXJBU0cuYWRkU2VjdXJpdHlHcm91cChhcHBTZWN1cml0eUdyb3VwKTtcblxuICAgICAgICB0aGlzLm1vZGVsREJCYWNrZW5kdGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgJ21vZGVsZGItYXdzcHZjJywge1xuICAgICAgICAgICAgbmV0d29ya01vZGU6IE5ldHdvcmtNb2RlLkFXU19WUEMsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5tb2RlbERCQmFja2VuZHRhc2tEZWZpbml0aW9uLmFkZFZvbHVtZShcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBuYW1lOiAnYXJ0aWZhY3Qtc3RvcmUnLFxuICAgICAgICAgICAgICAgIGhvc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlUGF0aDogJy9lY3MvYXJ0aWZhY3Qtc3RvcmUnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApXG4gICAgICAgIFxuICAgICAgICB0aGlzLm1vZGVsREJCYWNrZW5kdGFza0RlZmluaXRpb24uYWRkVm9sdW1lKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIG5hbWU6ICdjb25maWcnLFxuICAgICAgICAgICAgICAgIGhvc3Q6IHtcbiAgICAgICAgICAgICAgICAgICAgc291cmNlUGF0aDogJy9lY3MvYmFja2VuZC9jb25maWcnXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuICAgICAgICBcbiAgICAgICAgLy8gZGVmaW5lIGNvbnRhaW5lcnMgYmVsb3dcbiAgICAgICAgY29uc3QgbW9kZWxkYkJhY2tlbmQgPSB0aGlzLm1vZGVsREJCYWNrZW5kdGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdtb2RlbGRiLWJhY2tlbmQnLCB7XG4gICAgICAgICAgICBpbWFnZTogQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGNvbmZpZy52ZXJ0YUFJSW1hZ2VzLk1vZGVsREJCYWNrRW5kKSxcbiAgICAgICAgICAgIGNwdTogMTAwLFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgICAgIGVzc2VudGlhbDogdHJ1ZSwgICAgXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFZFUlRBX01PREVMREJfQ09ORklHOiAnL2NvbmZpZy9jb25maWcueWFtbCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dnaW5nOiB0aGlzLmxvZ0RyaXZlclxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIG1vZGVsZGJCYWNrZW5kLmFkZFBvcnRNYXBwaW5ncyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXJQb3J0OiA4MDg2LFxuICAgICAgICAgICAgICAgIHByb3RvY29sOiBQcm90b2NvbC5UQ1AsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODUsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCwgXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBtb2RlbGRiQmFja2VuZC5hZGRNb3VudFBvaW50cyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdhcnRpZmFjdC1zdG9yZScsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyUGF0aDogJy9hcnRpZmFjdC1zdG9yZS8nLFxuICAgICAgICAgICAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdjb25maWcnLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvY29uZmlnLycsXG4gICAgICAgICAgICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgLy8gQ3JlYXRlIHRoZSBiYWNrZW5kIHNlcnZpY2VcbiAgICAgICAgdGhpcy5iYWNrRW5kU2VydmljZSA9IG5ldyBFYzJTZXJ2aWNlKHRoaXMsICdtb2RlbGRiLWJhY2tlbmQtc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IHRoaXMuY2x1c3RlcixcbiAgICAgICAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLm1vZGVsREJCYWNrZW5kdGFza0RlZmluaXRpb24sXG4gICAgICAgICAgICBzZXJ2aWNlTmFtZTogJ21vZGVsZGItYmFja2VuZC1zZXJ2aWNlJyxcbiAgICAgICAgICAgIGFzc2lnblB1YmxpY0lwOiBmYWxzZSxcbiAgICAgICAgICAgIHNlY3VyaXR5R3JvdXA6IGFwcFNlY3VyaXR5R3JvdXAsXG4gICAgICAgICAgICB2cGNTdWJuZXRzOiB0aGlzLnB1YmxpY1N1Ym5ldHMsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMubW9kZWxEQlByb3h5dGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgJ21vZGVsZGItcHJveHktdGFzaycsIHtcbiAgICAgICAgICAgIG5ldHdvcmtNb2RlOiBOZXR3b3JrTW9kZS5BV1NfVlBDLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBtb2RlbGRiUHJveHkgPSB0aGlzLm1vZGVsREJQcm94eXRhc2tEZWZpbml0aW9uLmFkZENvbnRhaW5lcignbW9kZWxkYi1wcm94eScsIHtcbiAgICAgICAgICAgIGltYWdlOiBDb250YWluZXJJbWFnZS5mcm9tUmVnaXN0cnkoY29uZmlnLnZlcnRhQUlJbWFnZXMuTW9kZWxEQlByb3h5KSxcbiAgICAgICAgICAgIGNwdTogMTAwLFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgICAgIGVzc2VudGlhbDogdHJ1ZSwgICAgXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIE1EQl9BRERSRVNTOiBgJHttb2RlbGRiQmFja2VuZERpc2NvdmVyeURuc306ODA4NmAsXG4gICAgICAgICAgICAgICAgU0VSVkVSX0hUVFBfUE9SVDogXCI4MDgwXCJcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dnaW5nOiB0aGlzLmxvZ0RyaXZlclxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIG1vZGVsZGJQcm94eS5hZGRQb3J0TWFwcGluZ3MoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyUG9ydDogODA4MCxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDogUHJvdG9jb2wuVENQLFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIC8vIGNyZWF0ZSBwcm94eSBzZXJ2aWNlXG4gICAgICAgIHRoaXMucHJveHlFbmRTZXJ2aWNlID0gbmV3IEVjMlNlcnZpY2UodGhpcywgJ21vZGVsZGItcHJveHktc2VydmljZScsIHtcbiAgICAgICAgICAgIGNsdXN0ZXI6IHRoaXMuY2x1c3RlcixcbiAgICAgICAgICAgIHRhc2tEZWZpbml0aW9uOiB0aGlzLm1vZGVsREJQcm94eXRhc2tEZWZpbml0aW9uLFxuICAgICAgICAgICAgc2VydmljZU5hbWU6ICdtb2RlbGRiLXByb3h5LXNlcnZpY2UnLFxuICAgICAgICAgICAgYXNzaWduUHVibGljSXA6IGZhbHNlLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cDogYXBwU2VjdXJpdHlHcm91cCxcbiAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHRoaXMucHVibGljU3VibmV0cyxcbiAgICAgICAgfSk7XG5cbiAgICAgICAgYXBwU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoODA4NSkpO1xuICAgICAgICBhcHBTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCg4MDg2KSk7XG4gICAgICAgIGFwcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDIyKSk7XG4gICAgICAgIGFwcFNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDgwODApKTtcbiAgICAgICAgXG4gICAgICAgIHRoaXMubW9kZWxEQkZyb250ZW5kdGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgJ21vZGVsZGItZnJvbnRlbmQtdGFzaycsIHtcbiAgICAgICAgICAgIG5ldHdvcmtNb2RlOiBOZXR3b3JrTW9kZS5BV1NfVlBDLFxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBmcm9udEVuZCA9IHRoaXMubW9kZWxEQkZyb250ZW5kdGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdtb2RlbGRiLWZyb250ZW5kJywge1xuICAgICAgICAgICAgaW1hZ2U6IENvbnRhaW5lckltYWdlLmZyb21SZWdpc3RyeShjb25maWcudmVydGFBSUltYWdlcy5Nb2RlbERCRnJvbnRlbmQpLFxuICAgICAgICAgICAgY3B1OiAxMDAsXG4gICAgICAgICAgICBtZW1vcnlMaW1pdE1pQjogMjU2LFxuICAgICAgICAgICAgZXNzZW50aWFsOiB0cnVlLCBcbiAgICAgICAgICAgIGxvZ2dpbmc6IHRoaXMubG9nRHJpdmVyLFxuICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBERVBMT1lFRDogXCJ5ZXNcIixcbiAgICAgICAgICAgICAgICBCQUNLRU5EX0FQSV9QUk9UT0NPTDogXCJodHRwXCIsXG4gICAgICAgICAgICAgICAgQkFDS0VORF9BUElfRE9NQUlOOiBgJHttb2RlbGRiUHJveHlEaXNjb3ZlcnlEbnN9OjgwODBgLFxuICAgICAgICAgICAgICAgIE1EQl9BRERSRVNTOiBgaHR0cDovLyR7bW9kZWxkYlByb3h5RGlzY292ZXJ5RG5zfTo4MDgwYCxcbiAgICAgICAgICAgICAgICBBUlRJRkFDVE9SWV9BRERSRVNTOiBgaHR0cDovLyR7bW9kZWxkYkJhY2tlbmREaXNjb3ZlcnlEbnN9OjgwODZgXG4gICAgICAgICAgICB9LFxuICAgICAgICB9KTtcblxuICAgICAgICBmcm9udEVuZC5hZGRQb3J0TWFwcGluZ3MoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgY29udGFpbmVyUG9ydDogMzAwMCxcbiAgICAgICAgICAgICAgICBwcm90b2NvbDogUHJvdG9jb2wuVENQLFxuICAgICAgICAgICAgfVxuICAgICAgICApO1xuXG4gICAgICAgIG5ldyBBcHBsaWNhdGlvbkxvYWRCYWxhbmNlZEVjMlNlcnZpY2UodGhpcywgJ21vZGVsZGItZWNzLXNlcnZpY2UnLCB7XG4gICAgICAgICAgICBjbHVzdGVyOiB0aGlzLmNsdXN0ZXIsXG4gICAgICAgICAgICBsaXN0ZW5lclBvcnQ6IDgwLFxuICAgICAgICAgICAgY3B1OiAxMDAsXG4gICAgICAgICAgICB0YXNrRGVmaW5pdGlvbjogdGhpcy5tb2RlbERCRnJvbnRlbmR0YXNrRGVmaW5pdGlvbixcbiAgICAgICAgICAgIHB1YmxpY0xvYWRCYWxhbmNlcjogdHJ1ZSxcbiAgICAgICAgICAgIG1lbW9yeUxpbWl0TWlCOiAyNTYsXG4gICAgICAgICAgICBzZXJ2aWNlTmFtZTogJ21vZGVsZGItZnJvbnRlbmQtc2VydmljZScsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuYmFja0VuZFNlcnZpY2UuZW5hYmxlQ2xvdWRNYXAoe1xuICAgICAgICAgICAgZG5zUmVjb3JkVHlwZTogRG5zUmVjb3JkVHlwZS5BLFxuICAgICAgICAgICAgZmFpbHVyZVRocmVzaG9sZDogMSxcbiAgICAgICAgICAgIGNsb3VkTWFwTmFtZXNwYWNlOiB0aGlzLmNsb3VkTWFwTmFtZXNwYWNlLFxuICAgICAgICAgICAgbmFtZTogbW9kZWxkYkJhY2tlbmREaXNjb3ZlcnlOYW1lLFxuICAgICAgICAgICAgZG5zVHRsOiBEdXJhdGlvbi5taW51dGVzKDUpXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMucHJveHlFbmRTZXJ2aWNlLmVuYWJsZUNsb3VkTWFwKHtcbiAgICAgICAgICAgIGRuc1JlY29yZFR5cGU6IERuc1JlY29yZFR5cGUuQSxcbiAgICAgICAgICAgIGZhaWx1cmVUaHJlc2hvbGQ6IDEsXG4gICAgICAgICAgICBjbG91ZE1hcE5hbWVzcGFjZTogdGhpcy5jbG91ZE1hcE5hbWVzcGFjZSxcbiAgICAgICAgICAgIG5hbWU6ICdwcm94eScsXG4gICAgICAgICAgICBkbnNUdGw6IER1cmF0aW9uLm1pbnV0ZXMoNSlcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgIH1cbn0iXX0=