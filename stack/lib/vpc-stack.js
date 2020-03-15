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
    }
}
exports.VpcStack = VpcStack;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidnBjLXN0YWNrLmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsidnBjLXN0YWNrLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7O0FBQUEsd0NBQXVEO0FBQ3ZELDhDQUFrRDtBQUdsRCxNQUFhLFFBQVMsU0FBUSxZQUFLO0lBRy9CLFlBQVksS0FBVSxFQUFFLEVBQVUsRUFBRSxLQUFrQjtRQUNsRCxLQUFLLENBQUMsS0FBSyxFQUFFLEVBQUUsRUFBRSxLQUFLLENBQUMsQ0FBQztRQUN4QixJQUFJLENBQUMsR0FBRyxHQUFHLElBQUksYUFBRyxDQUFDLElBQUksRUFBRSxLQUFLLEVBQUU7WUFDNUIsTUFBTSxFQUFFLENBQUM7WUFDVCxtQkFBbUIsRUFBRTtnQkFDakI7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLFNBQVM7b0JBQ2YsVUFBVSxFQUFFLG9CQUFVLENBQUMsTUFBTTtpQkFDaEM7Z0JBQ0Q7b0JBQ0ksUUFBUSxFQUFFLEVBQUU7b0JBQ1osSUFBSSxFQUFFLGFBQWE7b0JBQ25CLFVBQVUsRUFBRSxvQkFBVSxDQUFDLE9BQU87aUJBQ2pDO2dCQUNEO29CQUNJLFFBQVEsRUFBRSxFQUFFO29CQUNaLElBQUksRUFBRSxLQUFLO29CQUNYLFVBQVUsRUFBRSxvQkFBVSxDQUFDLFFBQVE7aUJBQ2xDO2FBQ0o7U0FDSixDQUFDLENBQUM7SUFDUCxDQUFDO0NBQ0o7QUExQkQsNEJBMEJDIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwLCBTdGFjaywgU3RhY2tQcm9wcyB9IGZyb20gJ0Bhd3MtY2RrL2NvcmUnO1xuaW1wb3J0IHsgVnBjLCBTdWJuZXRUeXBlIH0gZnJvbSAnQGF3cy1jZGsvYXdzLWVjMidcblxuXG5leHBvcnQgY2xhc3MgVnBjU3RhY2sgZXh0ZW5kcyBTdGFjayB7XG4gICAgcmVhZG9ubHkgdnBjOiBWcGM7XG5cbiAgICBjb25zdHJ1Y3RvcihzY29wZTogQXBwLCBpZDogc3RyaW5nLCBwcm9wcz86IFN0YWNrUHJvcHMpIHtcbiAgICAgICAgc3VwZXIoc2NvcGUsIGlkLCBwcm9wcyk7XG4gICAgICAgIHRoaXMudnBjID0gbmV3IFZwYyh0aGlzLCAnVnBjJywge1xuICAgICAgICAgICAgbWF4QXpzOiAyLFxuICAgICAgICAgICAgc3VibmV0Q29uZmlndXJhdGlvbjogW1xuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2lkck1hc2s6IDI0LFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiAnaW5ncmVzcycsXG4gICAgICAgICAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFVCTElDLFxuICAgICAgICAgICAgICAgIH0sXG4gICAgICAgICAgICAgICAge1xuICAgICAgICAgICAgICAgICAgICBjaWRyTWFzazogMjQsXG4gICAgICAgICAgICAgICAgICAgIG5hbWU6ICdhcHBsaWNhdGlvbicsXG4gICAgICAgICAgICAgICAgICAgIHN1Ym5ldFR5cGU6IFN1Ym5ldFR5cGUuUFJJVkFURSxcbiAgICAgICAgICAgICAgICB9LFxuICAgICAgICAgICAgICAgIHtcbiAgICAgICAgICAgICAgICAgICAgY2lkck1hc2s6IDI4LFxuICAgICAgICAgICAgICAgICAgICBuYW1lOiAncmRzJyxcbiAgICAgICAgICAgICAgICAgICAgc3VibmV0VHlwZTogU3VibmV0VHlwZS5JU09MQVRFRCxcbiAgICAgICAgICAgICAgICB9XG4gICAgICAgICAgICBdXG4gICAgICAgIH0pO1xuICAgIH1cbn0iXX0=