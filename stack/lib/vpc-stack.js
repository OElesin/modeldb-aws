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
            vpc: this.vpc, allowAllOutbound: true,
        });
        this.rdsSecurityGroup = new aws_ec2_1.SecurityGroup(this, 'rdsSecurityGroup', {
            vpc: this.vpc, allowAllOutbound: false,
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
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidnBjLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQWtFO0FBQ2xFLDhDQUFpRTtBQUdqRSxNQUFhLFFBQVMsU0FBUSxZQUFLO0lBSy9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUNsRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksYUFBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDNUIsTUFBTSxFQUFFLENBQUM7WUFDVCxtQkFBbUIsRUFBRTtnQkFDakI7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLG9CQUFVLENBQUMsTUFBTTtpQkFDaEM7Z0JBQ0Q7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLGFBQWE7b0JBQ25CLFVBQVUsRUFBRSxvQkFBVSxDQUFDLE9BQU87aUJBQ2pDO2dCQUNEO29CQUNJLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxLQUFLO29CQUNYLFVBQVUsRUFBRSxvQkFBVSxDQUFDLFFBQVE7aUJBQ2xDO2FBQ0o7U0FDSixDQUFDLENBQUM7UUFDSCxJQUFJLENBQUMsd0JBQXdCLEdBQUcsSUFBSSx1QkFBYSxDQUFDLElBQUksRUFBRSwwQkFBMEIsRUFBRTtZQUNoRixHQUFHLEVBQUUsSUFBSSxDQUFDLEdBQUcsRUFBRSxnQkFBZ0IsRUFBRSxJQUFJO1NBQ3hDLENBQUMsQ0FBQztRQUVILElBQUksQ0FBQyxnQkFBZ0IsR0FBRyxJQUFJLHVCQUFhLENBQUMsSUFBSSxFQUFFLGtCQUFrQixFQUFFO1lBQ2hFLEdBQUcsRUFBRSxJQUFJLENBQUMsR0FBRyxFQUFFLGdCQUFnQixFQUFFLEtBQUs7U0FDekMsQ0FBQyxDQUFDO1FBRUgsSUFBSSxnQkFBUyxDQUFDLElBQUksRUFBRSxnQkFBZ0IsRUFBRTtZQUNsQyxVQUFVLEVBQUUsZ0JBQWdCO1lBQzVCLEtBQUssRUFBRSxJQUFJLENBQUMsZ0JBQWdCLENBQUMsZUFBZTtZQUM1QyxXQUFXLEVBQUUsNEJBQTRCO1NBQzVDLENBQUMsQ0FBQztRQUVILElBQUksZ0JBQVMsQ0FBQyxJQUFJLEVBQUUsd0JBQXdCLEVBQUU7WUFDMUMsVUFBVSxFQUFFLHdCQUF3QjtZQUNwQyxLQUFLLEVBQUUsSUFBSSxDQUFDLHdCQUF3QixDQUFDLGVBQWU7WUFDcEQsV0FBVyxFQUFFLG9DQUFvQztTQUNwRCxDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUEvQ0QsNEJBK0NDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBTdGFjaywgU3RhY2tQcm9wcywgQ2ZuT3V0cHV0IH0gZnJvbSAnQGF3cy1jZGsvY29yZSc7XG5pbXBvcnQgeyBWcGMsIFN1Ym5ldFR5cGUsIFNlY3VyaXR5R3JvdXAgfSBmcm9tICdAYXdzLWNkay9hd3MtZWMyJ1xuXG5cbmV4cG9ydCBjbGFzcyBWcGNTdGFjayBleHRlbmRzIFN0YWNrIHtcbiAgICByZWFkb25seSB2cGM6IFZwYztcbiAgICByZWFkb25seSByZHNTZWN1cml0eUdyb3VwOiBTZWN1cml0eUdyb3VwO1xuICAgIHJlYWRvbmx5IGFwcGxpY2F0aW9uU2VjdXJpdHlHcm91cDogU2VjdXJpdHlHcm91cDtcblxuICAgIGNvbnN0cnVjdG9yKHNjb3BlOiBBcHAsIGlkOiBzdHJpbmcsIHByb3BzPzogU3RhY2tQcm9wcykge1xuICAgICAgICBzdXBlcihzY29wZSwgaWQsIHByb3BzKTtcbiAgICAgICAgdGhpcy52cGMgPSBuZXcgVnBjKHRoaXMsICdWcGMnLCB7XG4gICAgICAgICAgICBtYXhBenM6IDIsXG4gICAgICAgICAgICBzdWJuZXRDb25maWd1cmF0aW9uOiBbXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdpbmdyZXNzJyxcbiAgICAgICAgICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QVUJMSUMsXG4gICAgICAgICAgICAgICAgfSxcbiAgICAgICAgICAgICAgICB7XG4gICAgICAgICAgICAgICAgICAgIGNpZHJNYXNrOiAyNCxcbiAgICAgICAgICAgICAgICAgICAgbmFtZTogJ2FwcGxpY2F0aW9uJyxcbiAgICAgICAgICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5QUklWQVRFLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBjaWRyTWFzazogMjgsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdyZHMnLFxuICAgICAgICAgICAgICAgICAgICBzdWJuZXRUeXBlOiBTdWJuZXRUeXBlLklTT0xBVEVELFxuICAgICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIF1cbiAgICAgICAgfSk7XG4gICAgICAgIHRoaXMuYXBwbGljYXRpb25TZWN1cml0eUdyb3VwID0gbmV3IFNlY3VyaXR5R3JvdXAodGhpcywgJ2FwcGxpY2F0aW9uU2VjdXJpdHlHcm91cCcsIHtcbiAgICAgICAgICAgIHZwYzogdGhpcy52cGMsIGFsbG93QWxsT3V0Ym91bmQ6IHRydWUsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIHRoaXMucmRzU2VjdXJpdHlHcm91cCA9IG5ldyBTZWN1cml0eUdyb3VwKHRoaXMsICdyZHNTZWN1cml0eUdyb3VwJywge1xuICAgICAgICAgICAgdnBjOiB0aGlzLnZwYywgYWxsb3dBbGxPdXRib3VuZDogZmFsc2UsXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ21vZGVsZGItcmRzLXNnJywge1xuICAgICAgICAgICAgZXhwb3J0TmFtZTogJ21vZGVsZGItcmRzLXNnJyxcbiAgICAgICAgICAgIHZhbHVlOiB0aGlzLnJkc1NlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLCBcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTW9kZWxEQiBSRFMgU2VjdXJpdHkgR3JvdXAnXG4gICAgICAgIH0pO1xuXG4gICAgICAgIG5ldyBDZm5PdXRwdXQodGhpcywgJ21vZGVsZGItYXBwbGljYXRpb24tc2cnLCB7XG4gICAgICAgICAgICBleHBvcnROYW1lOiAnbW9kZWxkYi1hcHBsaWNhdGlvbi1zZycsXG4gICAgICAgICAgICB2YWx1ZTogdGhpcy5hcHBsaWNhdGlvblNlY3VyaXR5R3JvdXAuc2VjdXJpdHlHcm91cElkLCBcbiAgICAgICAgICAgIGRlc2NyaXB0aW9uOiAnTW9kZWxEQiBBcHBsaWNhdGlvbiBTZWN1cml0eSBHcm91cCdcbiAgICAgICAgfSk7XG4gICAgfVxufSJdfQ==