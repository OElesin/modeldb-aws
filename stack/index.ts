
const cdk = require('@aws-cdk/core');
const ec2 = require('@aws-cdk/aws-ec2');
const ecs = require('@aws-cdk/aws-ecs');

// Based on https://aws.amazon.com/blogs/compute/introducing-cloud-native-networking-for-ecs-containers/
const app = new cdk.App();
const stack = new cdk.Stack(app, 'verta-ai-aws-ecs-service');

// Create the cluster
const vpc = new ec2.Vpc(stack, 'Vpc', { maxAzs: 2, });
const logging = new ecs.AwsLogDriver({
    streamPrefix: "verta-ai-aws-ecs-service",
})
const publicSubnets = vpc.selectSubnets({
    subnetType: ec2.SubnetType.PUBLIC
});
console.log(publicSubnets)
const cluster = new ecs.Cluster(stack, 'awsvpc-verta-ai-ecs-cluster', { vpc });
const asg = cluster.addCapacity('DefaultAutoScalingGroup', {
    instanceType: ec2.InstanceType.of(ec2.InstanceClass.T2, ec2.InstanceSize.MICRO),
    keyName: 'datafy-keypair',
    vpcSubnets: publicSubnets,
});



const userData = `
#!/bin/bash
mkdir -p /ecs/backend/config/
sudo curl -o /ecs/backend/config/config.yaml https://raw.githubusercontent.com/VertaAI/modeldb/master/backend/config/config.yaml
`

asg.addUserData(userData);
const asgSecurityGroup = new ec2.SecurityGroup(stack, 'ec2-SecurityGroup', { 
    vpc, allowAllOutbound: false,
});
asgSecurityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22))
asg.addSecurityGroup(asgSecurityGroup)


// Create a task definition with its own elastic network interface
const taskDefinition = new ecs.Ec2TaskDefinition(stack, 'modeldb-awspvc', {
    networkMode: ecs.NetworkMode.AWS_VPC,
});
  
taskDefinition.addVolume(
    {
        name: 'artifact-store',
        host: {
            sourcePath: '/ecs/artifact-store'
        }
    }
)

taskDefinition.addVolume(
    {
        name: 'config',
        host: {
            sourcePath: '/ecs/backend/config'
        }
    }
);

const modeldbBackend = taskDefinition.addContainer('modeldb-backend', {
    image: ecs.ContainerImage.fromRegistry('vertaaiofficial/modeldb-backend:latest'),
    cpu: 100,
    memoryLimitMiB: 256,
    essential: true,    
    environment: {
        VERTA_MODELDB_CONFIG: '/config/config.yaml'
    },
    logging
});

modeldbBackend.addPortMappings(
    {
        containerPort: 8085,
        hostPort: 8085,
        protocol: ecs.Protocol.TCP,
    },
    {
        containerPort: 8086,
        hostPort: 8086,
        protocol: ecs.Protocol.TCP, 
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


const modeldbProxy = taskDefinition.addContainer('modeldb-proxy', {
    image: ecs.ContainerImage.fromRegistry('vertaaiofficial/modeldb-proxy:latest'),
    cpu: 100,
    memoryLimitMiB: 256,
    essential: true,    
    environment: {
        MDB_ADDRESS: "modeldb-backend:8085",
        SERVER_HTTP_PORT: "8080"
    },
    logging
});

modeldbProxy.addPortMappings(
    {
        containerPort: 8080,
        hostPort: 8080,
        protocol: ecs.Protocol.TCP,
    }
);

const modeldbFrontend = taskDefinition.addContainer('modeldb-frontend', {
    image: ecs.ContainerImage.fromRegistry('vertaaiofficial/modeldb-frontend:latest'),
    cpu: 100,
    memoryLimitMiB: 256,
    essential: true,
    environment: {
        DEPLOYED: "yes",
        BACKEND_API_PROTOCOL: "http"
    }
});
  
// Create a security group that allows HTTP traffic on port 80 for our containers without modifying the security group on the instance
const securityGroup = new ec2.SecurityGroup(stack, 'modeldb--7623', { 
    vpc, allowAllOutbound: false,
});
  
securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8085));
securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(8086));
securityGroup.addIngressRule(ec2.Peer.anyIpv4(), ec2.Port.tcp(22));
  
  // Create the service
new ecs.Ec2Service(stack, 'awsvpc-ecs-demo-service', {
    cluster,
    taskDefinition,
    securityGroup,
});
  
app.synth();