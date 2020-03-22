import { Stack, StackProps, Fn, App, Duration } from "@aws-cdk/core";
import { AutoScalingGroup } from '@aws-cdk/aws-autoscaling'
import { SubnetType, Vpc, SubnetSelection, InstanceType, InstanceClass, InstanceSize, SecurityGroup, Peer, Port } from "@aws-cdk/aws-ec2";
import { AwsLogDriver, Ec2TaskDefinition, NetworkMode, ContainerImage, Cluster, Ec2Service, Protocol} from '@aws-cdk/aws-ecs';
import {ApplicationLoadBalancedEc2Service} from '@aws-cdk/aws-ecs-patterns';
import {PrivateDnsNamespace, DnsRecordType} from '@aws-cdk/aws-servicediscovery';
import * as AWS from 'aws-sdk';
import { ConfigOptions } from './config';


export interface ECSStackProps extends StackProps {
    vpc: Vpc,
    dbUsername: string;
}

export class ECSStack extends Stack {

    readonly cluster: Cluster;
    readonly backEndService: Ec2Service;
    readonly proxyEndService: Ec2Service;
    readonly publicSubnets: SubnetSelection;
    readonly clusterASG: AutoScalingGroup;
    readonly instanceUserData: string;
    readonly ecsClusterSecurityGroup: SecurityGroup;
    readonly containerSecurityGroup: SecurityGroup;
    readonly modelDBBackendtaskDefinition: Ec2TaskDefinition;
    readonly modelDBProxytaskDefinition: Ec2TaskDefinition;
    readonly modelDBFrontendtaskDefinition: Ec2TaskDefinition;
    readonly logDriver: AwsLogDriver;
    readonly cloudMapNamespace: PrivateDnsNamespace;
    

    constructor(scope: App, id: string, props: ECSStackProps) {
        super(scope, id, props);
        
        const serviceDiscoveryName = 'modeldb-cluster-aws.com';
        const modeldbBackendDiscoveryName = 'backend';
        const modeldbBackendDiscoveryDns = 'localhost';//`${modeldbBackendDiscoveryName}.${serviceDiscoveryName}`;
        const modeldbProxyDiscoveryDns = 'localhost';// `proxy.${serviceDiscoveryName}`
        const applicationSGId = Fn.importValue('modeldb-application-sg');
        const appSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', applicationSGId);
        
        // CloudMap Namespace
        this.cloudMapNamespace = new PrivateDnsNamespace(this, 'modeldb-namespace', {
            vpc: props.vpc,
            name: serviceDiscoveryName
        });

        this.cluster = new Cluster(this, 'modeldb-ecs-cluster', { 
            vpc: props.vpc,
            clusterName: 'modeldb-ecs-cluster'
        });
        this.publicSubnets = props.vpc.selectSubnets({
            subnetType: SubnetType.PUBLIC
        });
        const config = new ConfigOptions();
        this.logDriver = new AwsLogDriver({
            streamPrefix: "verta-ai-aws-ecs-service",
        });

        this.clusterASG = this.cluster.addCapacity('DefaultAutoScalingGroup', {
            instanceType: InstanceType.of(InstanceClass.M4, InstanceSize.XLARGE),
            keyName: 'datafy-keypair',
            vpcSubnets: this.publicSubnets,
        });
        const dbUrl = Fn.importValue('modeldb-rds-url');
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
        }
        secretsmanager.getSecretValue(_params, function(error, data){
            if (error) console.log(error, error.stack);
            else {
                let secureString = data['SecretString'];
                let secureStringObj = JSON.parse(String(secureString));
                let password = secureStringObj['password']
                let userData = _self.instanceUserData.replace('#dbPassword', password);
                _self.clusterASG.addUserData(userData); 
            }
        });

        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22))
        this.clusterASG.addSecurityGroup(appSecurityGroup);

        this.modelDBBackendtaskDefinition = new Ec2TaskDefinition(this, 'modeldb-awspvc', {
            networkMode: NetworkMode.AWS_VPC,
        });
        
        this.modelDBBackendtaskDefinition.addVolume(
            {
                name: 'artifact-store',
                host: {
                    sourcePath: '/ecs/artifact-store'
                }
            }
        )
        
        this.modelDBBackendtaskDefinition.addVolume(
            {
                name: 'config',
                host: {
                    sourcePath: '/ecs/backend/config'
                }
            }
        );
        
        // define containers below
        const modeldbBackend = this.modelDBBackendtaskDefinition.addContainer('modeldb-backend', {
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBBackEnd),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,    
            environment: {
                VERTA_MODELDB_CONFIG: '/config/config.yaml'
            },
            logging: this.logDriver
        });
        
        modeldbBackend.addPortMappings(
            {
                containerPort: 8086,
                protocol: Protocol.TCP,
            },
            {
                containerPort: 8085,
                protocol: Protocol.TCP, 
            }
        );
        
        modeldbBackend.addMountPoints(
            {
                sourceVolume: 'artifact-store',
                containerPath: '/artifact-store/',
                readOnly: false
            },
            {
                sourceVolume: 'config',
                containerPath: '/config/',
                readOnly: false
            }
        );

        // Create the backend service
        this.backEndService = new Ec2Service(this, 'modeldb-backend-service', {
            cluster: this.cluster,
            taskDefinition: this.modelDBBackendtaskDefinition,
            serviceName: 'modeldb-backend-service',
            assignPublicIp: false,
            securityGroup: appSecurityGroup,
            vpcSubnets: this.publicSubnets,
        });

        this.modelDBProxytaskDefinition = new Ec2TaskDefinition(this, 'modeldb-proxy-task', {
            networkMode: NetworkMode.AWS_VPC,
        });

        const modeldbProxy = this.modelDBProxytaskDefinition.addContainer('modeldb-proxy', {
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBProxy),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,    
            environment: {
                MDB_ADDRESS: `${modeldbBackendDiscoveryDns}:8086`,
                SERVER_HTTP_PORT: "8080"
            },
            logging: this.logDriver
        });
        
        modeldbProxy.addPortMappings(
            {
                containerPort: 8080,
                protocol: Protocol.TCP,
            }
        );

        // create proxy service
        this.proxyEndService = new Ec2Service(this, 'modeldb-proxy-service', {
            cluster: this.cluster,
            taskDefinition: this.modelDBProxytaskDefinition,
            serviceName: 'modeldb-proxy-service',
            assignPublicIp: false,
            securityGroup: appSecurityGroup,
            vpcSubnets: this.publicSubnets,
        });

        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8085));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8086));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8080));
        
        this.modelDBFrontendtaskDefinition = new Ec2TaskDefinition(this, 'modeldb-frontend-task', {
            networkMode: NetworkMode.AWS_VPC,
        });

        const frontEnd = this.modelDBFrontendtaskDefinition.addContainer('modeldb-frontend', {
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBFrontend),
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

        frontEnd.addPortMappings(
            {
                containerPort: 3000,
                protocol: Protocol.TCP,
            }
        );

        new ApplicationLoadBalancedEc2Service(this, 'modeldb-ecs-service', {
            cluster: this.cluster,
            listenerPort: 80,
            cpu: 100,
            taskDefinition: this.modelDBFrontendtaskDefinition,
            publicLoadBalancer: true,
            memoryLimitMiB: 256,
            serviceName: 'modeldb-frontend-service',
        });

        this.backEndService.enableCloudMap({
            dnsRecordType: DnsRecordType.A,
            failureThreshold: 1,
            cloudMapNamespace: this.cloudMapNamespace,
            name: modeldbBackendDiscoveryName,
            dnsTtl: Duration.minutes(5)
        });

        this.proxyEndService.enableCloudMap({
            dnsRecordType: DnsRecordType.A,
            failureThreshold: 1,
            cloudMapNamespace: this.cloudMapNamespace,
            name: 'proxy',
            dnsTtl: Duration.minutes(5)
        });
        
    }
}