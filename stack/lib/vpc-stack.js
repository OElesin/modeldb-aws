"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@aws-cdk/core");
const aws_ec2_1 = require("@aws-cdk/aws-ec2");
class VpcStack extends core_1.Stack {
    constructor(scope, id, props) {
        super(scope, id, props);
        this.vpc = new aws_ec2_1.Vpc(this, 'Vpc', {
            maxAzs: 2,
            subnetConfiguration: [
                {
                    cidrMask: 24,
                    name: 'ingress',
                    subnetType: aws_ec2_1.SubnetType.PUBLIC,
                },
                {
                    cidrMask: 24,
                    name: 'application',
                    subnetType: aws_ec2_1.SubnetType.PRIVATE,
                },
                {
                    cidrMask: 28,
                    name: 'rds',
                    subnetType: aws_ec2_1.SubnetType.ISOLATED,
                }
            ]
        });
        this.applicationSecurityGroup = new aws_ec2_1.SecurityGroup(this, 'applicationSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'applicationSecurityGroup',
            allowAllOutbound: true,
        });
        this.rdsSecurityGroup = new aws_ec2_1.SecurityGroup(this, 'rdsSecurityGroup', {
            vpc: this.vpc,
            securityGroupName: 'rdsSecurityGroup',
            allowAllOutbound: true,
        });
        new core_1.CfnOutput(this, 'modeldb-rds-sg', {
            exportName: 'modeldb-rds-sg',
            value: this.rdsSecurityGroup.securityGroupId,
            description: 'ModelDB RDS Security Group'
        });
        new core_1.CfnOutput(this, 'modeldb-application-sg', {
            exportName: 'modeldb-application-sg',
            value: this.applicationSecurityGroup.securityGroupId,
            description: 'ModelDB Application Security Group'
        });
    }
}
exports.VpcStack = VpcStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidnBjLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQWtFO0FBQ2xFLDhDQUFpRTtBQUdqRSxNQUFhLFFBQVMsU0FBUSxZQUFLO0lBSy9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUNsRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksYUFBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDNUIsTUFBTSxFQUFFLENBQUM7WUFDVCxtQkFBbUIsRUFBRTtnQkFDakI7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLG9CQUFVLENBQUMsTUFBTTtpQkFDaEM7Z0JBQ0Q7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLGFBQWE7b0JBQ25CLFVBQVUsRUFBRSxvQkFBVSxDQUFDLE9BQU87aUJBQ2pDO2dCQUNEO29CQUNJLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxLQUFLO29CQUNYLFVBQVUsRUFBRSxvQkFBVSxDQUFDLFFBQVE7aUJBQ2xDO2FBQ0o7U0FDSixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSx1QkFBYSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNoRixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixpQkFBaUIsRUFBRSwwQkFBMEI7WUFDN0MsZ0JBQWdCLEVBQUUsSUFBSTtTQUN6QixDQUFDLENBQUM7UUFFSCxJQUFJLENBQUMsZ0JBQWdCLEdBQUcsSUFBSSx1QkFBYSxDQUFDLElBQUksRUFBRSxrQkFBa0IsRUFBRTtZQUNoRSxHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUc7WUFDYixpQkFBaUIsRUFBRSxrQkFBa0I7WUFDckMsZ0JBQWdCLEVBQUUsSUFBSTtTQUN6QixDQUFDLENBQUM7UUFFSCxJQUFJLGdCQUFTLENBQUMsSUFBSSxFQUFFLGdCQUFnQixFQUFFO1lBQ2xDLFVBQVUsRUFBRSxnQkFBZ0I7WUFDNUIsS0FBSyxFQUFFLElBQUksQ0FBQyxnQkFBZ0IsQ0FBQyxlQUFlO1lBQzVDLFdBQVcsRUFBRSw0QkFBNEI7U0FDNUMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSx3QkFBd0IsRUFBRTtZQUMxQyxVQUFVLEVBQUUsd0JBQXdCO1lBQ3BDLEtBQUssRUFBRSxJQUFJLENBQUMsd0JBQXdCLENBQUMsZUFBZTtZQUNwRCxXQUFXLEVBQUUsb0NBQW9DO1NBQ3BELENBQUMsQ0FBQztJQUNQLENBQUM7Q0FDSjtBQW5ERCw0QkFtREMiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBBcHAsIFN0YWNrLCBTdGFja1Byb3BzLCBDZm5PdXRwdXQgfSBmcm9tICdAYXdzLWNkay9jb3JlJztcbmltcG9ydCB7IFZwYywgU3VibmV0VHlwZSwgU2VjdXJpdHlHcm91cCB9IGZyb20gJ0Bhd3MtY2RrL2F3cy1lYzInXG5cblxuZXhwb3J0IGNsYXNzIFZwY1N0YWNrIGV4dGVuZHMgU3RhY2sge1xuICAgIHJlYWRvbmx5IHZwYzogVnBjO1xuICAgIHJlYWRvbmx5IHJkc1NlY3VyaXR5R3JvdXA6IFNlY3VyaXR5R3JvdXA7XG4gICAgcmVhZG9ubHkgYXBwbGljYXRpb25TZWN1cml0eUdyb3VwOiBTZWN1cml0eUdyb3VwO1xuXG4gICAgY29uc3RydWN0b3Ioc2NvcGU6IEFwcCwgaWQ6IHN0cmluZywgcHJvcHM/OiBTdGFja1Byb3BzKSB7XG4gICAgICAgIHN1cGVyKHNjb3BlLCBpZCwgcHJvcHMpO1xuICAgICAgICB0aGlzLnZwYyA9IG5ldyBWcGModGhpcywgJ1ZwYycsIHtcbiAgICAgICAgICAgIG1heEF6czogMixcbiAgICAgICAgICAgIHN1Ym5ldENvbmZpZ3VyYXRpb246IFtcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogJ2luZ3Jlc3MnLFxuICAgICAgICAgICAgICAgICAgICBzdWJuZXRUeXBlOiBTdWJuZXRUeXBlLlBVQkxJQyxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiAnYXBwbGljYXRpb24nLFxuICAgICAgICAgICAgICAgICAgICBzdWJuZXRUeXBlOiBTdWJuZXRUeXBlLlBSSVZBVEUsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGNpZHJNYXNrOiAyOCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogJ3JkcycsXG4gICAgICAgICAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuSVNPTEFURUQsXG4gICAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgXVxuICAgICAgICB9KTtcbiAgICAgICAgdGhpcy5hcHBsaWNhdGlvblNlY3VyaXR5R3JvdXAgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCAnYXBwbGljYXRpb25TZWN1cml0eUdyb3VwJywge1xuICAgICAgICAgICAgdnBjOiB0aGlzLnZwYywgXG4gICAgICAgICAgICBzZWN1cml0eUdyb3VwTmFtZTogJ2FwcGxpY2F0aW9uU2VjdXJpdHlHcm91cCcsXG4gICAgICAgICAgICBhbGxvd0FsbE91dGJvdW5kOiB0cnVlLFxuICAgICAgICB9KTtcblxuICAgICAgICB0aGlzLnJkc1NlY3VyaXR5R3JvdXAgPSBuZXcgU2VjdXJpdHlHcm91cCh0aGlzLCAncmRzU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsIFxuICAgICAgICAgICAgc2VjdXJpdHlHcm91cE5hbWU6ICdyZHNTZWN1cml0eUdyb3VwJyxcbiAgICAgICAgICAgIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ21vZGVsZGItcmRzLXNnJywge1xuICAgICAgICAgICAgZXhwb3J0TmFtZTogJ21vZGVsZGItcmRzLXNnJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnJkc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLCBcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTW9kZWxEQiBSRFMgU2VjdXJpdHkgR3JvdXAnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ21vZGVsZGItYXBwbGljYXRpb24tc2cnLCB7XG4gICAgICAgICAgICBleHBvcnROYW1lOiAnbW9kZWxkYi1hcHBsaWNhdGlvbi1zZycsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5hcHBsaWNhdGlvblNlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLCBcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTW9kZWxEQiBBcHBsaWNhdGlvbiBTZWN1cml0eSBHcm91cCdcbiAgICAgICAgfSk7XG4gICAgfVxufSJdfQ==