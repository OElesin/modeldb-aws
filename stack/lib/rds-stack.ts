import { App, Duration, Stack, StackProps, CfnOutput, } from "@aws-cdk/core";
import { DatabaseInstance, DatabaseInstanceEngine, StorageType } from '@aws-cdk/aws-rds';
import { InstanceClass, InstanceSize, InstanceType, SubnetType, Vpc, SecurityGroup, Peer, Port } from "@aws-cdk/aws-ec2";

export interface RDSStackProps extends StackProps {
    vpc: Vpc,
    username: string;
    databaseName: string;
    port: number;
}


export class RDSStack extends Stack {

    readonly postgresRDSInstance: DatabaseInstance;

    constructor(scope: App, id: string, props: RDSStackProps) {
        super(scope, id, props);

        const rdsSecurityGroup = new SecurityGroup(this, 'rdsSecurityGroup', {
            vpc: props.vpc, allowAllOutbound: false,
        });

        rdsSecurityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(props.port))
        
        this.postgresRDSInstance = new DatabaseInstance(this, 'ModelDBRDSInstance', {
            engine: DatabaseInstanceEngine.POSTGRES,
            instanceClass: InstanceType.of(InstanceClass.T2, InstanceSize.SMALL),
            vpc: props.vpc,
            vpcPlacement: { subnetType: SubnetType.ISOLATED },
            storageEncrypted: true,
            multiAz: false,
            autoMinorVersionUpgrade: false,
            allocatedStorage: 25,
            storageType: StorageType.GP2,
            backupRetention: Duration.days(1),
            deletionProtection: false,
            masterUsername: props.username,
            databaseName: props.databaseName,
            securityGroups: [rdsSecurityGroup],
            // masterUserPassword: this.secret.secretValue,
            // generateMasterUserPassword: true,
            port: props.port
        });

        
        
        const dbUrl = `jdbc:postgresql://${this.postgresRDSInstance.dbInstanceEndpointAddress}:${this.postgresRDSInstance.dbInstanceEndpointPort}`;
        new CfnOutput(this, 'modeldb-rds-url', {
            exportName: 'modeldb-rds-url',
            value: dbUrl, 
            description: 'ModelDB RDS Postgres Database Url'
        });
    }
}
