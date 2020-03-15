import { App, Stack, StackProps, CfnOutput } from '@aws-cdk/core';
import { Vpc, SubnetType, SecurityGroup } from '@aws-cdk/aws-ec2'


export class VpcStack extends Stack {
    readonly vpc: Vpc;
    readonly rdsSecurityGroup: SecurityGroup;
    readonly frontendSecurityGroup: SecurityGroup;

    constructor(scope: App, id: string, props?: StackProps) {
        super(scope, id, props);
        this.vpc = new Vpc(this, 'Vpc', {
            maxAzs: 2,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'ingress',
                    subnetType: SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'application',
                    subnetType: SubnetType.PRIVATE,
                },
                {
                    cidrMask: 28,
                    name: 'rds',
                    subnetType: SubnetType.ISOLATED,
                }
            ]
        });
        this.rdsSecurityGroup = new SecurityGroup(this, 'rdsSecurityGroup', {
            vpc: this.vpc, allowAllOutbound: false,
        });

        this.frontendSecurityGroup = new SecurityGroup(this, 'frontendSecurityGroup', {
            vpc: this.vpc, allowAllOutbound: true,
        });

        new CfnOutput(this, 'modeldb-rds-sg', {
            exportName: 'modeldb-rds-sg',
            value: this.rdsSecurityGroup.securityGroupId, 
            description: 'ModelDB RDS Security Group'
        });

        new CfnOutput(this, 'modeldb-frontend-sg', {
            exportName: 'modeldb-frontend-sg',
            value: this.frontendSecurityGroup.securityGroupId, 
            description: 'ModelDB Frontend Security Group'
        });
    }
}