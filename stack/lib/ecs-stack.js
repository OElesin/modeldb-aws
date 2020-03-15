"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_ecs_1 = require("@aws-cdk/aws-ecs");
const config_1 = require("./config");
const aws_secretsmanager_1 = require("@aws-cdk/aws-secretsmanager");
class ECSStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const dbPassword = aws_secretsmanager_1.Secret.fromSecretAttributes(this, 'SamplePassword', {
            secretArn: 'arn:aws:secretsmanager:{region}:{organisation-id}:secret:modeldb-postgress-password',
        });
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
        this.instanceUserData = `
        #!/bin/bash
        mkdir -p /ecs/backend/config/
        sudo curl -o 
        cat <<EOF > /ecs/backend/config/config.yaml 
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
            RdbPassword: "${dbPassword}"

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
            RdbUsername: 
        EOF
        `;
        this.clusterASG.addUserData(this.instanceUserData);
        this.ecsClusterSecurityGroup = new aws_ec2_1.SecurityGroup(this, 'ec2-SecurityGroup', {
            vpc: props.vpc, allowAllOutbound: false,
        });
        this.ecsClusterSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        this.clusterASG.addSecurityGroup(this.ecsClusterSecurityGroup);
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
        this.containerSecurityGroup = new aws_ec2_1.SecurityGroup(this, 'modeldb--7623', {
            vpc: props.vpc, allowAllOutbound: false,
        });
        this.containerSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8085));
        this.containerSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(8086));
        this.containerSecurityGroup.addIngressRule(aws_ec2_1.Peer.anyIpv4(), aws_ec2_1.Port.tcp(22));
        // Create the service
        this.ec2Service = new aws_ecs_1.Ec2Service(this, 'awsvpc-ecs-demo-service', {
            cluster: this.cluster,
            taskDefinition: this.taskDefinition,
            securityGroup: this.containerSecurityGroup
        });
    }
}
exports.ECSStack = ECSStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiZWNzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiZWNzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQTJEO0FBRTNELDhDQUEwSTtBQUMxSSw4Q0FBOEg7QUFDOUgscUNBQXlDO0FBQ3pDLG9FQUFxRDtBQU9yRCxNQUFhLFFBQVMsU0FBUSxZQUFLO0lBYS9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFvQjtRQUNwRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixNQUFNLFVBQVUsR0FBRywyQkFBTSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNuRSxTQUFTLEVBQUUscUZBQXFGO1NBQ25HLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxPQUFPLEdBQUcsSUFBSSxpQkFBTyxDQUFDLElBQUksRUFBRSw2QkFBNkIsRUFBRSxFQUFFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRyxFQUFFLENBQUMsQ0FBQztRQUNwRixJQUFJLENBQUMsYUFBYSxHQUFHLEtBQUssQ0FBQyxHQUFHLENBQUMsYUFBYSxDQUFDO1lBQ3pDLFVBQVUsRUFBRSxvQkFBVSxDQUFDLE1BQU07U0FDaEMsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxNQUFNLEdBQUcsSUFBSSxzQkFBYSxFQUFFLENBQUM7UUFDbkMsSUFBSSxDQUFDLFNBQVMsR0FBRyxJQUFJLHNCQUFZLENBQUM7WUFDOUIsWUFBWSxFQUFFLDBCQUEwQjtTQUMzQyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsVUFBVSxHQUFHLElBQUksQ0FBQyxPQUFPLENBQUMsV0FBVyxDQUFDLHlCQUF5QixFQUFFO1lBQ2xFLFlBQVksRUFBRSxzQkFBWSxDQUFDLEVBQUUsQ0FBQyx1QkFBYSxDQUFDLEVBQUUsRUFBRSxzQkFBWSxDQUFDLEtBQUssQ0FBQztZQUNuRSxPQUFPLEVBQUUsZ0JBQWdCO1lBQ3pCLFVBQVUs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bXBvcnQgeyBBcHAsIFN0YWNrLCBTdGFja1Byb3BzLCBGbiB9IGZyb20gXCJAYXdzLWNkay9jb3JlXCI7XG5pbXBvcnQgeyBBdXRvU2NhbGluZ0dyb3VwIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWF1dG9zY2FsaW5nJ1xuaW1wb3J0IHsgU3VibmV0VHlwZSwgVnBjLCBTdWJuZXRTZWxlY3Rpb24sIEluc3RhbmNlVHlwZSwgSW5zdGFuY2VDbGFzcywgSW5zdGFuY2VTaXplLCBTZWN1cml0eUdyb3VwLCBQZWVyLCBQb3J0IH0gZnJvbSBcIkBhd3MtY2RrL2F3cy1lYzJcIjtcbmltcG9ydCB7IEF3c0xvZ0RyaXZlciwgRWMyVGFza0RlZmluaXRpb24sIE5ldHdvcmtNb2RlLCBDb250YWluZXJJbWFnZSwgQ2x1c3RlciwgRWMyU2VydmljZSwgUHJvdG9jb2x9IGZyb20gJ0Bhd3MtY2RrL2F3cy1lY3MnO1xuaW1wb3J0IHsgQ29uZmlnT3B0aW9ucyB9IGZyb20gJy4vY29uZmlnJztcbmltcG9ydCB7IFNlY3JldCB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgRUNTU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICAgIHZwYzogVnBjLFxuICAgIGRiVXNlcm5hbWU6IHN0cmluZztcbn1cblxuZXhwb3J0IGNsYXNzIEVDU1N0YWNrIGV4dGVuZHMgU3RhY2sge1xuXG4gICAgcmVhZG9ubHkgY2x1c3RlcjogQ2x1c3RlcjtcbiAgICByZWFkb25seSBlYzJTZXJ2aWNlOiBFYzJTZXJ2aWNlO1xuICAgIHJlYWRvbmx5IHB1YmxpY1N1Ym5ldHM6IFN1Ym5ldFNlbGVjdGlvbjtcbiAgICByZWFkb25seSBjbHVzdGVyQVNHOiBBdXRvU2NhbGluZ0dyb3VwO1xuICAgIHJlYWRvbmx5IGluc3RhbmNlVXNlckRhdGE6IHN0cmluZztcbiAgICByZWFkb25seSBlY3NDbHVzdGVyU2VjdXJpdHlHcm91cDogU2VjdXJpdHlHcm91cDtcbiAgICByZWFkb25seSBjb250YWluZXJTZWN1cml0eUdyb3VwOiBTZWN1cml0eUdyb3VwO1xuICAgIHJlYWRvbmx5IHRhc2tEZWZpbml0aW9uOiBFYzJUYXNrRGVmaW5pdGlvbjtcbiAgICByZWFkb25seSBsb2dEcml2ZXI6IEF3c0xvZ0RyaXZlcjtcbiAgICBcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBBcHAsIGlkOiBzdHJpbmcsIHByb3BzOiBFQ1NTdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuICAgICAgICBjb25zdCBkYlBhc3N3b3JkID0gU2VjcmV0LmZyb21TZWNyZXRBdHRyaWJ1dGVzKHRoaXMsICdTYW1wbGVQYXNzd29yZCcsIHtcbiAgICAgICAgICAgIHNlY3JldEFybjogJ2Fybjphd3M6c2VjcmV0c21hbmFnZXI6e3JlZ2lvbn06e29yZ2FuaXNhdGlvbi1pZH06c2VjcmV0Om1vZGVsZGItcG9zdGdyZXNzLXBhc3N3b3JkJyxcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICB0aGlzLmNsdXN0ZXIgPSBuZXcgQ2x1c3Rlcih0aGlzLCAnYXdzdnBjLXZlcnRhLWFpLWVjcy1jbHVzdGVyJywgeyB2cGM6IHByb3BzLnZwYyB9KTtcbiAgICAgICAgdGhpcy5wdWJsaWNTdWJuZXRzID0gcHJvcHMudnBjLnNlbGVjdFN1Ym5ldHMoe1xuICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QVUJMSUNcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGNvbmZpZyA9IG5ldyBDb25maWdPcHRpb25zKCk7XG4gICAgICAgIHRoaXMubG9nRHJpdmVyID0gbmV3IEF3c0xvZ0RyaXZlcih7XG4gICAgICAgICAgICBzdHJlYW1QcmVmaXg6IFwidmVydGEtYWktYXdzLWVjcy1zZXJ2aWNlXCIsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMuY2x1c3RlckFTRyA9IHRoaXMuY2x1c3Rlci5hZGRDYXBhY2l0eSgnRGVmYXVsdEF1dG9TY2FsaW5nR3JvdXAnLCB7XG4gICAgICAgICAgICBpbnN0YW5jZVR5cGU6IEluc3RhbmNlVHlwZS5vZihJbnN0YW5jZUNsYXNzLlQyLCBJbnN0YW5jZVNpemUuTUlDUk8pLFxuICAgICAgICAgICAga2V5TmFtZTogJ2RhdGFmeS1rZXlwYWlyJyxcbiAgICAgICAgICAgIHZwY1N1Ym5ldHM6IHRoaXMucHVibGljU3VibmV0cyxcbiAgICAgICAgfSk7XG4gICAgICAgIGNvbnN0IGRiVXJsID0gRm4uaW1wb3J0VmFsdWUoJ21vZGVsZGItcmRzLXVybCcpO1xuXG4gICAgICAgIHRoaXMuaW5zdGFuY2VVc2VyRGF0YSA9IGBcbiAgICAgICAgIyEvYmluL2Jhc2hcbiAgICAgICAgbWtkaXIgLXAgL2Vjcy9iYWNrZW5kL2NvbmZpZy9cbiAgICAgICAgc3VkbyBjdXJsIC1vIFxuICAgICAgICBjYXQgPDxFT0YgPiAvZWNzL2JhY2tlbmQvY29uZmlnL2NvbmZpZy55YW1sIFxuICAgICAgICAjVGhpcyBjb25maWcgaXMgdXNlZCBieSBkb2NrZXIgY29tcG9zZS5cbiAgICAgICAgI01vZGVsREIgUHJvcGVydGllc1xuICAgICAgICBncnBjU2VydmVyOlxuICAgICAgICBwb3J0OiA4MDg1XG5cbiAgICAgICAgc3ByaW5nU2VydmVyOlxuICAgICAgICBwb3J0OiA4MDg2XG4gICAgICAgIHNodXRkb3duVGltZW91dDogMzAgI3RpbWUgaW4gc2Vjb25kXG5cbiAgICAgICAgYXJ0aWZhY3RTdG9yZUNvbmZpZzpcbiAgICAgICAgYXJ0aWZhY3RTdG9yZVR5cGU6IE5GUyAjUzMsIEdDUCwgTkZTXG4gICAgICAgIE5GUzpcbiAgICAgICAgICAgIG5mc1VybFByb3RvY29sOiBodHRwXG4gICAgICAgICAgICBuZnNSb290UGF0aDogL2FydGlmYWN0LXN0b3JlL1xuICAgICAgICAgICAgYXJ0aWZhY3RFbmRwb2ludDpcbiAgICAgICAgICAgIGdldEFydGlmYWN0OiBcImFwaS92MS9hcnRpZmFjdC9nZXRBcnRpZmFjdFwiXG4gICAgICAgICAgICBzdG9yZUFydGlmYWN0OiBcImFwaS92MS9hcnRpZmFjdC9zdG9yZUFydGlmYWN0XCJcblxuICAgICAgICAjIERhdGFiYXNlIHNldHRpbmdzICh0eXBlIG1vbmdvZGIsIGNvdWNoYmFzZWRiLCByZWxhdGlvbmFsIGV0Yy4uKVxuICAgICAgICBkYXRhYmFzZTpcbiAgICAgICAgREJUeXBlOiByZWxhdGlvbmFsXG4gICAgICAgIHRpbWVvdXQ6IDRcbiAgICAgICAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gICAgICAgIFJkYkNvbmZpZ3VyYXRpb246XG4gICAgICAgICAgICBSZGJEYXRhYmFzZU5hbWU6IHBvc3RncmVzXG4gICAgICAgICAgICBSZGJEcml2ZXI6IFwib3JnLnBvc3RncmVzcWwuRHJpdmVyXCJcbiAgICAgICAgICAgIFJkYkRpYWxlY3Q6IFwib3JnLmhpYmVybmF0ZS5kaWFsZWN0LlBvc3RncmVTUUxEaWFsZWN0XCJcbiAgICAgICAgICAgIFJkYlVybDogXCIke2RiVXJsfVwiXG4gICAgICAgICAgICBSZGJVc2VybmFtZTogXCIke3Byb3BzLmRiVXNlcm5hbWV9XCJcbiAgICAgICAgICAgIFJkYlBhc3N3b3JkOiBcIiR7ZGJQYXNzd29yZH1cIlxuXG4gICAgICAgICMgVGVzdCBEYXRhYmFzZSBzZXR0aW5ncyAodHlwZSBtb25nb2RiLCBjb3VjaGJhc2VkYiBldGMuLilcbiAgICAgICAgdGVzdDpcbiAgICAgICAgdGVzdC1kYXRhYmFzZTpcbiAgICAgICAgICAgIERCVHlwZTogcmVsYXRpb25hbFxuICAgICAgICAgICAgdGltZW91dDogNFxuICAgICAgICAgICAgbGlxdWliYXNlTG9ja1RocmVzaG9sZDogNjAgI3RpbWUgaW4gc2Vjb25kXG4gICAgICAgICAgICBSZGJDb25maWd1cmF0aW9uOlxuICAgICAgICAgICAgUmRiRGF0YWJhc2VOYW1lOiBwb3N0Z3Jlc1xuICAgICAgICAgICAgUmRiRHJpdmVyOiBcIm9yZy5wb3N0Z3Jlc3FsLkRyaXZlclwiXG4gICAgICAgICAgICBSZGJEaWFsZWN0OiBcIm9yZy5oaWJlcm5hdGUuZGlhbGVjdC5Qb3N0Z3JlU1FMRGlhbGVjdFwiXG4gICAgICAgICAgICBSZGJVcmw6IFwiamRiYzpwb3N0Z3Jlc3FsOi8vbW9kZWxkYi1wb3N0Z3Jlczo1NDMyXCJcbiAgICAgICAgICAgIFJkYlVzZXJuYW1lOiBcbiAgICAgICAgRU9GXG4gICAgICAgIGA7XG4gICAgICAgIHRoaXMuY2x1c3RlckFTRy5hZGRVc2VyRGF0YSh0aGlzLmluc3RhbmNlVXNlckRhdGEpO1xuXG4gICAgICAgIHRoaXMuZWNzQ2x1c3RlclNlY3VyaXR5R3JvdXAgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCAnZWMyLVNlY3VyaXR5R3JvdXAnLCB7XG4gICAgICAgICAgICB2cGM6IHByb3BzLnZwYywgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmVjc0NsdXN0ZXJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCgyMikpXG4gICAgICAgIHRoaXMuY2x1c3RlckFTRy5hZGRTZWN1cml0eUdyb3VwKHRoaXMuZWNzQ2x1c3RlclNlY3VyaXR5R3JvdXApO1xuXG4gICAgICAgIHRoaXMudGFza0RlZmluaXRpb24gPSBuZXcgRWMyVGFza0RlZmluaXRpb24odGhpcywgJ21vZGVsZGItYXdzcHZjJywge1xuICAgICAgICAgICAgbmV0d29ya01vZGU6IE5ldHdvcmtNb2RlLkFXU19WUEMsXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2FydGlmYWN0LXN0b3JlJyxcbiAgICAgICAgICAgICAgICBob3N0OiB7XG4gICAgICAgICAgICAgICAgICAgIHNvdXJjZVBhdGg6ICcvZWNzL2FydGlmYWN0LXN0b3JlJ1xuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cbiAgICAgICAgKVxuICAgICAgICBcbiAgICAgICAgdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRWb2x1bWUoXG4gICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgbmFtZTogJ2NvbmZpZycsXG4gICAgICAgICAgICAgICAgaG9zdDoge1xuICAgICAgICAgICAgICAgICAgICBzb3VyY2VQYXRoOiAnL2Vjcy9iYWNrZW5kL2NvbmZpZydcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICAvLyBkZWZpbmUgY29udGFpbmVycyBiZWxvd1xuICAgICAgICBjb25zdCBtb2RlbGRiQmFja2VuZCA9IHRoaXMudGFza0RlZmluaXRpb24uYWRkQ29udGFpbmVyKCdtb2RlbGRiLWJhY2tlbmQnLCB7XG4gICAgICAgICAgICBpbWFnZTogQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGNvbmZpZy52ZXJ0YUFJSW1hZ2VzLk1vZGVsREJCYWNrRW5kKSxcbiAgICAgICAgICAgIGNwdTogMTAwLFxuICAgICAgICAgICAgbWVtb3J5TGltaXRNaUI6IDI1NixcbiAgICAgICAgICAgIGVzc2VudGlhbDogdHJ1ZSwgICAgXG4gICAgICAgICAgICBlbnZpcm9ubWVudDoge1xuICAgICAgICAgICAgICAgIFZFUlRBX01PREVMREJfQ09ORklHOiAnL2NvbmZpZy9jb25maWcueWFtbCdcbiAgICAgICAgICAgIH0sXG4gICAgICAgICAgICBsb2dnaW5nOiB0aGlzLmxvZ0RyaXZlclxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIG1vZGVsZGJCYWNrZW5kLmFkZFBvcnRNYXBwaW5ncyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBjb250YWluZXJQb3J0OiA4MDg1LFxuICAgICAgICAgICAgICAgIGhvc3RQb3J0OiA4MDg1LFxuICAgICAgICAgICAgICAgIHByb3RvY29sOiBQcm90b2NvbC5UQ1AsXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODYsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODYsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCwgXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG4gICAgICAgIFxuICAgICAgICBtb2RlbGRiQmFja2VuZC5hZGRNb3VudFBvaW50cyhcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdhcnRpZmFjdC1zdG9yZScsXG4gICAgICAgICAgICAgICAgY29udGFpbmVyUGF0aDogJy9hcnRpZmFjdC1zdG9yZS8nLFxuICAgICAgICAgICAgICAgIHJlYWRPbmx5OiBmYWxzZVxuICAgICAgICAgICAgfSxcbiAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICBzb3VyY2VWb2x1bWU6ICdjb25maWcnLFxuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBhdGg6ICcvY29uZmlnLycsXG4gICAgICAgICAgICAgICAgcmVhZE9ubHk6IGZhbHNlXG4gICAgICAgICAgICB9XG4gICAgICAgICk7XG5cbiAgICAgICAgY29uc3QgbW9kZWxkYlByb3h5ID0gdGhpcy50YXNrRGVmaW5pdGlvbi5hZGRDb250YWluZXIoJ21vZGVsZGItcHJveHknLCB7XG4gICAgICAgICAgICBpbWFnZTogQ29udGFpbmVySW1hZ2UuZnJvbVJlZ2lzdHJ5KGNvbmZpZy52ZXJ0YUFJSW1hZ2VzLk1vZGVsREJQcm94eSksXG4gICAgICAgICAgICBjcHU6IDEwMCxcbiAgICAgICAgICAgIG1lbW9yeUxpbWl0TWlCOiAyNTYsXG4gICAgICAgICAgICBlc3NlbnRpYWw6IHRydWUsICAgIFxuICAgICAgICAgICAgZW52aXJvbm1lbnQ6IHtcbiAgICAgICAgICAgICAgICBNREJfQUREUkVTUzogXCJtb2RlbGRiLWJhY2tlbmQ6ODA4NVwiLFxuICAgICAgICAgICAgICAgIFNFUlZFUl9IVFRQX1BPUlQ6IFwiODA4MFwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgbG9nZ2luZzogdGhpcy5sb2dEcml2ZXJcbiAgICAgICAgfSk7XG4gICAgICAgIFxuICAgICAgICBtb2RlbGRiUHJveHkuYWRkUG9ydE1hcHBpbmdzKFxuICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgIGNvbnRhaW5lclBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgaG9zdFBvcnQ6IDgwODAsXG4gICAgICAgICAgICAgICAgcHJvdG9jb2w6IFByb3RvY29sLlRDUCxcbiAgICAgICAgICAgIH1cbiAgICAgICAgKTtcblxuICAgICAgICB0aGlzLmNvbnRhaW5lclNlY3VyaXR5R3JvdXAgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCAnbW9kZWxkYi0tNzYyMycsIHsgXG4gICAgICAgICAgICB2cGM6IHByb3BzLnZwYywgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgICAgIH0pO1xuICAgICAgICB0aGlzLmNvbnRhaW5lclNlY3VyaXR5R3JvdXAuYWRkSW5ncmVzc1J1bGUoUGVlci5hbnlJcHY0KCksIFBvcnQudGNwKDgwODUpKTtcbiAgICAgICAgdGhpcy5jb250YWluZXJTZWN1cml0eUdyb3VwLmFkZEluZ3Jlc3NSdWxlKFBlZXIuYW55SXB2NCgpLCBQb3J0LnRjcCg4MDg2KSk7XG4gICAgICAgIHRoaXMuY29udGFpbmVyU2VjdXJpdHlHcm91cC5hZGRJbmdyZXNzUnVsZShQZWVyLmFueUlwdjQoKSwgUG9ydC50Y3AoMjIpKTtcblxuICAgICAgICAvLyBDcmVhdGUgdGhlIHNlcnZpY2VcbiAgICAgICAgdGhpcy5lYzJTZXJ2aWNlID0gbmV3IEVjMlNlcnZpY2UodGhpcywgJ2F3c3ZwYy1lY3MtZGVtby1zZXJ2aWNlJywge1xuICAgICAgICAgICAgY2x1c3RlcjogdGhpcy5jbHVzdGVyLFxuICAgICAgICAgICAgdGFza0RlZmluaXRpb246IHRoaXMudGFza0RlZmluaXRpb24sXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwOiB0aGlzLmNvbnRhaW5lclNlY3VyaXR5R3JvdXBcbiAgICAgICAgfSk7XG4gICAgfVxufSJdfQ==