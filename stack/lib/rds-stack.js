"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_rds_1 = require("@aws-cdk/aws-rds");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
const aws_secretsmanager_1 = require("@aws-cdk/aws-secretsmanager");
class RDSStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        const rdsSGId = core_1.Fn.importValue('modeldb-rds-sg');
        const applicationSGId = core_1.Fn.importValue('modeldb-application-sg');
        const rdsSecurityGroup = aws_ec2_1.SecurityGroup.fromSecurityGroupId(this, 'ec2-SecurityGroup', rdsSGId);
        new aws_ec2_1.CfnSecurityGroupIngress(this, 'RDSIngressRule', {
            ipProtocol: 'tcp',
            fromPort: props.port,
            toPort: props.port,
            sourceSecurityGroupId: applicationSGId,
            groupId: rdsSGId
        });
        const accountId = core_1.Stack.of(this).account;
        const region = core_1.Stack.of(this).region;
        const dbPasswordSecret = aws_secretsmanager_1.Secret.fromSecretAttributes(this, 'modeldb-rds-credentials', {
            secretArn: `arn:aws:secretsmanager:${region}:${accountId}:secret:modeldb-rds-password-SnYFyD`
        });
        this.postgresRDSInstance = new aws_rds_1.DatabaseInstance(this, 'ModelDBRDSInstance', {
            engine: aws_rds_1.DatabaseInstanceEngine.POSTGRES,
            instanceClass: aws_ec2_1.InstanceType.of(aws_ec2_1.InstanceClass.T2, aws_ec2_1.InstanceSize.SMALL),
            vpc: props.vpc,
            vpcPlacement: { subnetType: aws_ec2_1.SubnetType.ISOLATED },
            storageEncrypted: true,
            multiAz: false,
            autoMinorVersionUpgrade: false,
            allocatedStorage: 25,
            storageType: aws_rds_1.StorageType.GP2,
            backupRetention: core_1.Duration.days(1),
            deletionProtection: false,
            masterUsername: props.username,
            databaseName: props.databaseName,
            securityGroups: [rdsSecurityGroup],
            masterUserPassword: dbPasswordSecret.secretValue,
            // generateMasterUserPassword: true,
            port: props.port
        });
        const dbUrl = `jdbc:postgresql://${this.postgresRDSInstance.dbInstanceEndpointAddress}:${this.postgresRDSInstance.dbInstanceEndpointPort}`;
        new core_1.CfnOutput(this, 'modeldb-rds-url', {
            exportName: 'modeldb-rds-url',
            value: dbUrl,
            description: 'ModelDB RDS Postgres Database Url'
        });
    }
}
exports.RDSStack = RDSStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicmRzLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsicmRzLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQWlGO0FBQ2pGLDhDQUEwRjtBQUMxRiw4Q0FBdUk7QUFDdkksb0VBQW1EO0FBVW5ELE1BQWEsUUFBUyxTQUFRLFlBQUs7SUFJL0IsWUFBWSxLQUFVLEVBQUUsRUFBVSxFQUFFLEtBQW9CO1FBQ3BELEtBQUssQ0FBQyxLQUFLLEVBQUUsRUFBRSxFQUFFLEtBQUssQ0FBQyxDQUFDO1FBRXhCLE1BQU0sT0FBTyxHQUFHLFNBQUUsQ0FBQyxXQUFXLENBQUMsZ0JBQWdCLENBQUMsQ0FBQztRQUNqRCxNQUFNLGVBQWUsR0FBRyxTQUFFLENBQUMsV0FBVyxDQUFDLHdCQUF3QixDQUFDLENBQUM7UUFDakUsTUFBTSxnQkFBZ0IsR0FBRyx1QkFBYSxDQUFDLG1CQUFtQixDQUFDLElBQUksRUFBRSxtQkFBbUIsRUFBRSxPQUFPLENBQUMsQ0FBQztRQUMvRixJQUFJLGlDQUF1QixDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNoRCxVQUFVLEVBQUUsS0FBSztZQUNqQixRQUFRLEVBQUUsS0FBSyxDQUFDLElBQUk7WUFDcEIsTUFBTSxFQUFFLEtBQUssQ0FBQyxJQUFJO1lBQ2xCLHFCQUFxQixFQUFFLGVBQWU7WUFDdEMsT0FBTyxFQUFFLE9BQU87U0FDbkIsQ0FBQyxDQUFDO1FBQ0gsTUFBTSxTQUFTLEdBQUcsWUFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxPQUFPLENBQUE7UUFDeEMsTUFBTSxNQUFNLEdBQUcsWUFBSyxDQUFDLEVBQUUsQ0FBQyxJQUFJLENBQUMsQ0FBQyxNQUFNLENBQUE7UUFFcEMsTUFBTSxnQkFBZ0IsR0FBRywyQkFBTSxDQUFDLG9CQUFvQixDQUFDLElBQUksRUFBRSx5QkFBeUIsRUFBRTtZQUNsRixTQUFTLEVBQUUsMEJBQTBCLE1BQU0sSUFBSSxTQUFTLHFDQUFxQztTQUNoRyxDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsbUJBQW1CLEdBQUcsSUFBSSwwQkFBZ0IsQ0FBQyxJQUFJLEVBQUUsb0JBQW9CLEVBQUU7WUFDeEUsTUFBTSxFQUFFLGdDQUFzQixDQUFDLFFBQVE7WUFDdkMsYUFBYSxFQUFFLHNCQUFZLENBQUMsRUFBRSxDQUFDLHVCQUFhLENBQUMsRUFBRSxFQUFFLHNCQUFZLENBQUMsS0FBSyxDQUFDO1lBQ3BFLEdBQUcsRUFBRSxLQUFLLENBQUMsR0FBRztZQUNkLFlBQVksRUFBRSxFQUFFLFVBQVUsRUFBRSxvQkFBVSxDQUFDLFFBQVEsRUFBRTtZQUNqRCxnQkFBZ0IsRUFBRSxJQUFJO1lBQ3RCLE9BQU8sRUFBRSxLQUFLO1lBQ2QsdUJBQXVCLEVBQUUsS0FBSztZQUM5QixnQkFBZ0IsRUFBRSxFQUFFO1lBQ3BCLFdBQVcsRUFBRSxxQkFBVyxDQUFDLEdBQUc7WUFDNUIsZUFBZSxFQUFFLGVBQVEsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1lBQ2pDLGtCQUFrQixFQUFFLEtBQUs7WUFDekIsY0FBYyxFQUFFLEtBQUssQ0FBQyxRQUFRO1lBQzlCLFlBQVksRUFBRSxLQUFLLENBQUMsWUFBWTtZQUNoQyxjQUFjLEVBQUUsQ0FBQyxnQkFBZ0IsQ0FBQztZQUNsQyxrQkFBa0IsRUFBRSxnQkFBZ0IsQ0FBQyxXQUFXO1lBQ2hELG9DQUFvQztZQUNwQyxJQUFJLEVBQUUsS0FBSyxDQUFDLElBQUk7U0FDbkIsQ0FBQyxDQUFDO1FBRUgsTUFBTSxLQUFLLEdBQUcscUJBQXFCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyx5QkFBeUIsSUFBSSxJQUFJLENBQUMsbUJBQW1CLENBQUMsc0JBQXNCLEVBQUUsQ0FBQztRQUMzSSxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLGlCQUFpQixFQUFFO1lBQ25DLFVBQVUsRUFBRSxpQkFBaUI7WUFDN0IsS0FBSyxFQUFFLEtBQUs7WUFDWixXQUFXLEVBQUUsbUNBQW1DO1NBQ25ELENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQW5ERCw0QkFtREMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIER1cmF0aW9uLCBTdGFjaywgU3RhY2tQcm9wcywgQ2ZuT3V0cHV0LCBGbiwgfSBmcm9tIFwiQGF3cy1jZGsvY29yZVwiO1xuaW1wb3J0IHsgRGF0YWJhc2VJbnN0YW5jZSwgRGF0YWJhc2VJbnN0YW5jZUVuZ2luZSwgU3RvcmFnZVR5cGUsIH0gZnJvbSAnQGF3cy1jZGsvYXdzLXJkcyc7XG5pbXBvcnQgeyBJbnN0YW5jZUNsYXNzLCBJbnN0YW5jZVNpemUsIEluc3RhbmNlVHlwZSwgU3VibmV0VHlwZSwgVnBjLCBTZWN1cml0eUdyb3VwLCBDZm5TZWN1cml0eUdyb3VwSW5ncmVzcywgfSBmcm9tIFwiQGF3cy1jZGsvYXdzLWVjMlwiO1xuaW1wb3J0IHtTZWNyZXR9IGZyb20gJ0Bhd3MtY2RrL2F3cy1zZWNyZXRzbWFuYWdlcic7XG5cbmV4cG9ydCBpbnRlcmZhY2UgUkRTU3RhY2tQcm9wcyBleHRlbmRzIFN0YWNrUHJvcHMge1xuICAgIHZwYzogVnBjLFxuICAgIHVzZXJuYW1lOiBzdHJpbmc7XG4gICAgZGF0YWJhc2VOYW1lOiBzdHJpbmc7XG4gICAgcG9ydDogbnVtYmVyO1xufVxuXG5cbmV4cG9ydCBjbGFzcyBSRFNTdGFjayBleHRlbmRzIFN0YWNrIHtcblxuICAgIHJlYWRvbmx5IHBvc3RncmVzUkRTSW5zdGFuY2U6IERhdGFiYXNlSW5zdGFuY2U7XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQXBwLCBpZDogc3RyaW5nLCBwcm9wczogUkRTU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcblxuICAgICAgICBjb25zdCByZHNTR0lkID0gRm4uaW1wb3J0VmFsdWUoJ21vZGVsZGItcmRzLXNnJyk7XG4gICAgICAgIGNvbnN0IGFwcGxpY2F0aW9uU0dJZCA9IEZuLmltcG9ydFZhbHVlKCdtb2RlbGRiLWFwcGxpY2F0aW9uLXNnJyk7XG4gICAgICAgIGNvbnN0IHJkc1NlY3VyaXR5R3JvdXAgPSBTZWN1cml0eUdyb3VwLmZyb21TZWN1cml0eUdyb3VwSWQodGhpcywgJ2VjMi1TZWN1cml0eUdyb3VwJywgcmRzU0dJZCk7XG4gICAgICAgIG5ldyBDZm5TZWN1cml0eUdyb3VwSW5ncmVzcyh0aGlzLCAnUkRTSW5ncmVzc1J1bGUnLCB7XG4gICAgICAgICAgICBpcFByb3RvY29sOiAndGNwJyxcbiAgICAgICAgICAgIGZyb21Qb3J0OiBwcm9wcy5wb3J0LFxuICAgICAgICAgICAgdG9Qb3J0OiBwcm9wcy5wb3J0LFxuICAgICAgICAgICAgc291cmNlU2VjdXJpdHlHcm91cElkOiBhcHBsaWNhdGlvblNHSWQsXG4gICAgICAgICAgICBncm91cElkOiByZHNTR0lkXG4gICAgICAgIH0pO1xuICAgICAgICBjb25zdCBhY2NvdW50SWQgPSBTdGFjay5vZih0aGlzKS5hY2NvdW50XG4gICAgICAgIGNvbnN0IHJlZ2lvbiA9IFN0YWNrLm9mKHRoaXMpLnJlZ2lvblxuXG4gICAgICAgIGNvbnN0IGRiUGFzc3dvcmRTZWNyZXQgPSBTZWNyZXQuZnJvbVNlY3JldEF0dHJpYnV0ZXModGhpcywgJ21vZGVsZGItcmRzLWNyZWRlbnRpYWxzJywge1xuICAgICAgICAgICAgc2VjcmV0QXJuOiBgYXJuOmF3czpzZWNyZXRzbWFuYWdlcjoke3JlZ2lvbn06JHthY2NvdW50SWR9OnNlY3JldDptb2RlbGRiLXJkcy1wYXNzd29yZC1TbllGeURgXG4gICAgICAgIH0pO1xuICAgICAgICBcbiAgICAgICAgdGhpcy5wb3N0Z3Jlc1JEU0luc3RhbmNlID0gbmV3IERhdGFiYXNlSW5zdGFuY2UodGhpcywgJ01vZGVsREJSRFNJbnN0YW5jZScsIHtcbiAgICAgICAgICAgIGVuZ2luZTogRGF0YWJhc2VJbnN0YW5jZUVuZ2luZS5QT1NUR1JFUyxcbiAgICAgICAgICAgIGluc3RhbmNlQ2xhc3M6IEluc3RhbmNlVHlwZS5vZihJbnN0YW5jZUNsYXNzLlQyLCBJbnN0YW5jZVNpemUuU01BTEwpLFxuICAgICAgICAgICAgdnBjOiBwcm9wcy52cGMsXG4gICAgICAgICAgICB2cGNQbGFjZW1lbnQ6IHsgc3VibmV0VHlwZTogU3VibmV0VHlwZS5JU09MQVRFRCB9LFxuICAgICAgICAgICAgc3RvcmFnZUVuY3J5cHRlZDogdHJ1ZSxcbiAgICAgICAgICAgIG11bHRpQXo6IGZhbHNlLFxuICAgICAgICAgICAgYXV0b01pbm9yVmVyc2lvblVwZ3JhZGU6IGZhbHNlLFxuICAgICAgICAgICAgYWxsb2NhdGVkU3RvcmFnZTogMjUsXG4gICAgICAgICAgICBzdG9yYWdlVHlwZTogU3RvcmFnZVR5cGUuR1AyLFxuICAgICAgICAgICAgYmFja3VwUmV0ZW50aW9uOiBEdXJhdGlvbi5kYXlzKDEpLFxuICAgICAgICAgICAgZGVsZXRpb25Qcm90ZWN0aW9uOiBmYWxzZSxcbiAgICAgICAgICAgIG1hc3RlclVzZXJuYW1lOiBwcm9wcy51c2VybmFtZSxcbiAgICAgICAgICAgIGRhdGFiYXNlTmFtZTogcHJvcHMuZGF0YWJhc2VOYW1lLFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cHM6IFtyZHNTZWN1cml0eUdyb3VwXSxcbiAgICAgICAgICAgIG1hc3RlclVzZXJQYXNzd29yZDogZGJQYXNzd29yZFNlY3JldC5zZWNyZXRWYWx1ZSxcbiAgICAgICAgICAgIC8vIGdlbmVyYXRlTWFzdGVyVXNlclBhc3N3b3JkOiB0cnVlLFxuICAgICAgICAgICAgcG9ydDogcHJvcHMucG9ydFxuICAgICAgICB9KTtcbiAgICAgICAgXG4gICAgICAgIGNvbnN0IGRiVXJsID0gYGpkYmM6cG9zdGdyZXNxbDovLyR7dGhpcy5wb3N0Z3Jlc1JEU0luc3RhbmNlLmRiSW5zdGFuY2VFbmRwb2ludEFkZHJlc3N9OiR7dGhpcy5wb3N0Z3Jlc1JEU0luc3RhbmNlLmRiSW5zdGFuY2VFbmRwb2ludFBvcnR9YDtcbiAgICAgICAgbmV3IENmbk91dHB1dCh0aGlzLCAnbW9kZWxkYi1yZHMtdXJsJywge1xuICAgICAgICAgICAgZXhwb3J0TmFtZTogJ21vZGVsZGItcmRzLXVybCcsXG4gICAgICAgICAgICB2YWx1ZTogZGJVcmwsIFxuICAgICAgICAgICAgZGVzY3JpcHRpb246ICdNb2RlbERCIFJEUyBQb3N0Z3JlcyBEYXRhYmFzZSBVcmwnXG4gICAgICAgIH0pO1xuICAgIH1cbn1cbiJdfQ==