import { Stack, StackProps, Fn, App } from "@aws-cdk/core";
import { AutoScalingGroup } from '@aws-cdk/aws-autoscaling'
import { SubnetType, Vpc, SubnetSelection, InstanceType, InstanceClass, InstanceSize, SecurityGroup, Peer, Port } from "@aws-cdk/aws-ec2";
import { AwsLogDriver, Ec2TaskDefinition, NetworkMode, ContainerImage, Cluster, Ec2Service, Protocol} from '@aws-cdk/aws-ecs';
import {ApplicationLoadBalancedEc2Service} from '@aws-cdk/aws-ecs-patterns';

import { ConfigOptions } from './config';
// import { Secret } from '@aws-cdk/aws-secretsmanager';

export interface ECSStackProps extends StackProps {
    vpc: Vpc,
    dbUsername: string;
}

export class ECSStack extends Stack {

    readonly cluster: Cluster;
    readonly ec2Service: Ec2Service;
    readonly publicSubnets: SubnetSelection;
    readonly clusterASG: AutoScalingGroup;
    readonly instanceUserData: string;
    readonly ecsClusterSecurityGroup: SecurityGroup;
    readonly containerSecurityGroup: SecurityGroup;
    readonly taskDefinition: Ec2TaskDefinition;
    readonly logDriver: AwsLogDriver;
    

    constructor(scope: App, id: string, props: ECSStackProps) {
        super(scope, id, props);
        // const dbPassword = Secret.fromSecretAttributes(this, 'SamplePassword', {
        //     secretArn: 'arn:aws:secretsmanager:{region}:{organisation-id}:secret:modeldb-postgress-password',
        // });
        const applicationSGId = Fn.importValue('modeldb-application-sg');
        const appSecurityGroup = SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', applicationSGId);
        
        this.cluster = new Cluster(this, 'awsvpc-verta-ai-ecs-cluster', { vpc: props.vpc });
        this.publicSubnets = props.vpc.selectSubnets({
            subnetType: SubnetType.PUBLIC
        });
        const config = new ConfigOptions();
        this.logDriver = new AwsLogDriver({
            streamPrefix: "verta-ai-aws-ecs-service",
        });

        this.clusterASG = this.cluster.addCapacity('DefaultAutoScalingGroup', {
            instanceType: InstanceType.of(InstanceClass.T2, InstanceSize.MICRO),
            keyName: 'datafy-keypair',
            vpcSubnets: this.publicSubnets,
        });
        const dbUrl = Fn.importValue('modeldb-rds-url');
        const testPass = 'testpassword'
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
        
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22))
        this.clusterASG.addSecurityGroup(appSecurityGroup);

        this.taskDefinition = new Ec2TaskDefinition(this, 'modeldb-awspvc', {
            networkMode: NetworkMode.AWS_VPC,
        });
        
        this.taskDefinition.addVolume(
            {
                name: 'artifact-store',
                host: {
                    sourcePath: '/ecs/artifact-store'
                }
            }
        )
        
        this.taskDefinition.addVolume(
            {
                name: 'config',
                host: {
                    sourcePath: '/ecs/backend/config'
                }
            }
        );

        const modeldbFrontend = this.taskDefinition.addContainer('modeldb-frontend', {
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBFrontend),
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
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBBackEnd),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,    
            environment: {
                VERTA_MODELDB_CONFIG: '/config/config.yaml'
            },
            logging: this.logDriver
        });
        
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

        const modeldbProxy = this.taskDefinition.addContainer('modeldb-proxy', {
            image: ContainerImage.fromRegistry(config.vertaAIImages.ModelDBProxy),
            cpu: 100,
            memoryLimitMiB: 256,
            essential: true,    
            environment: {
                MDB_ADDRESS: "modeldb-backend:8085",
                SERVER_HTTP_PORT: "8080"
            },
            logging: this.logDriver
        });

        modeldbFrontend.addPortMappings(
            {
                containerPort: 80,
                hostPort: 80,
                protocol: Protocol.TCP,
            }
        );

        modeldbBackend.addPortMappings(
            {
                containerPort: 8085,
                hostPort: 8085,
                protocol: Protocol.TCP,
            },
            {
                containerPort: 8086,
                hostPort: 8086,
                protocol: Protocol.TCP, 
            }
        );

        modeldbProxy.addPortMappings(
            {
                containerPort: 8080,
                hostPort: 8080,
                protocol: Protocol.TCP,
            }
        );

        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8085));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(8086));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22));
        appSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(80));

        new ApplicationLoadBalancedEc2Service(this, 'modeldb-ecs-service', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            listenerPort: 80,
            serviceName: 'modeldb-ecs-service',
            publicLoadBalancer: true,
            enableECSManagedTags: true
        });
        
    }
}