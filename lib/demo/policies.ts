/**
 * Synthetic policy documents for the demo workspace (spec 3.7). Northbeam
 * Software is fictional. The six documents are written to agree with each
 * other on every number (MFA everywhere, quarterly access reviews, 72-hour
 * breach notification, daily encrypted backups kept 35 days, annual DR test,
 * SOC 2 Type II planned, AWS eu-west-1, 90-day logs) so that drafted answers
 * can cite any of them without contradiction.
 */

export const DEMO_COMPANY = "Northbeam Software";

export type DemoPolicy = {
  title: string;
  fileName: string;
  markdown: string;
};

const SYNTHETIC_NOTE =
  "> Synthetic demo document. Northbeam Software is a fictional company created for the Attestly demo workspace.";

const informationSecurity = `# Information Security Policy

${SYNTHETIC_NOTE}

Version 3.2. Owner: Head of Security. Approved by the Chief Technology Officer on 14 January 2026.

## Purpose and scope

This policy sets out how Northbeam Software protects the confidentiality, integrity and availability of the Northbeam Insights platform and of the customer data entrusted to us. It applies to all employees, contractors and interns, to every system that stores or processes company or customer data, and to all locations from which staff work. Northbeam Software provides its service only as software as a service (SaaS); no Northbeam software is installed on customer premises, and all updates are deployed centrally by Northbeam.

## Governance

The Head of Security is responsible for the information security programme and reports monthly to the Chief Technology Officer. The CTO approves this policy and every supporting policy. All security policies are reviewed at least annually, and sooner after a significant change to the business, the platform or the threat landscape. Exceptions to any policy must be requested in writing, approved by the Head of Security, recorded in the exception register and reviewed every 90 days.

Risk is managed through a risk register maintained by the Head of Security. A formal risk assessment is performed annually and whenever a major new system or vendor is introduced. Each risk has an owner, a treatment plan and a target date.

Northbeam Software does not yet hold an independent attestation. A SOC 2 Type II audit is planned: the readiness assessment was completed in 2026 and the audit observation window is scheduled to begin in the first quarter of 2027. Until the report is available, customers may request this policy set and a summary of the most recent penetration test under NDA.

## People security

Background checks are performed on all employees and contractors before their start date, covering identity, right to work, employment history and, where permitted by local law, criminal records. All staff sign a confidentiality agreement as part of their contract.

Security awareness training is mandatory for all staff during onboarding and annually thereafter, and covers phishing, data handling, password and MFA hygiene, and how to report an incident. Completion is tracked, and access is suspended for anyone more than 30 days overdue. Engineers additionally complete secure coding training every year. All employees and contractors are located in the European Union or the United Kingdom; Northbeam does not use offshore development centres or outsourced development teams.

## Endpoint security

Every company laptop is enrolled in mobile device management before first use. MDM enforces full-disk encryption (FileVault on macOS, BitLocker on Windows), a screen lock after five minutes of inactivity, automatic operating system updates and endpoint detection and response software. Personal devices may not be used to access production systems or customer data. Lost or stolen devices must be reported to the security channel immediately so they can be remotely locked and wiped.

## Infrastructure and data security

The production platform runs in Amazon Web Services in the eu-west-1 (Ireland) region across three availability zones. Northbeam Software does not operate its own data centres or server rooms; physical security of the hosting facilities is provided by AWS and reviewed through AWS's own compliance reports.

Customer data is encrypted at rest with AES-256 using keys managed in AWS Key Management Service, with automatic annual key rotation. Data in transit over public networks is encrypted with TLS 1.2 or higher. Network access to production is limited by security groups that deny all traffic by default.

## Logging and monitoring

Application, infrastructure and authentication logs are collected centrally in Datadog. Logs are retained for 90 days and then deleted automatically. Alerts for suspicious authentication activity, privilege changes and infrastructure anomalies page the on-call engineer.

## Secure development

Northbeam follows a secure software development lifecycle (secure SDLC). Every change is made through a pull request that requires review and approval by a second engineer before merge. Automated checks run on every pull request: unit tests, static analysis, secret scanning and dependency scanning of all third-party packages. Production deployments are performed only through the CI/CD pipeline.

Vulnerabilities are remediated within 7 days for critical, 30 days for high and 90 days for medium severity findings. An independent penetration test of the platform is performed at least annually by a qualified third party; the most recent test was completed in November 2025 and all high findings were fixed within 30 days.

## Compliance

Breaches of this policy may lead to disciplinary action. Questions about this policy should be sent to security@northbeam.example.
`;

const accessControl = `# Access Control Policy

${SYNTHETIC_NOTE}

Version 2.4. Owner: Head of Security. Approved by the Chief Technology Officer on 14 January 2026. Reviewed annually.

## Purpose

This policy defines how Northbeam Software grants, reviews and removes access to company systems and customer data. Its aim is that every person has the minimum access needed for their role, that every access can be traced to an individual, and that access is removed promptly when it is no longer needed.

## Principles

Access is granted on the principle of least privilege and on a need-to-know basis. Access is role-based: each role has a documented set of permissions, and anything beyond the role requires a separate, time-limited approval. Every user has a unique named account. Shared and generic accounts are prohibited, except for documented service accounts that are owned by a named engineer, have no interactive login and use credentials stored in AWS Secrets Manager.

## Authentication

Single sign-on through Google Workspace is used for all company applications that support it. Multi-factor authentication (MFA) is enforced on all systems, including email, source control, the cloud console, the VPN and every SaaS tool that holds company or customer data. Engineers with production access must use a hardware security key as their second factor. Applications that cannot use single sign-on must enforce their own MFA, or they may not be used.

Passwords for any remaining local accounts must be at least 14 characters long, unique, and stored in the company password manager. Passwords are never shared over email or chat.

## Production access

Access to the production environment is restricted to the platform engineering team. Engineers do not hold standing administrative access. Elevated access is requested through a just-in-time workflow, approved by a second engineer, limited to four hours and logged. Direct database access to customer data is only permitted to resolve an incident or a customer support request, and the reason is recorded in the ticket. All administrative actions in AWS are recorded by CloudTrail and retained with other logs for 90 days.

## Provisioning

New access is requested by the employee's manager through the IT ticketing system, specifying the role and the systems needed. The system owner approves the request before access is granted. Access for contractors is set to expire on the end date of their contract.

## Access reviews

Access rights are reviewed quarterly by the owner of each system. The review covers all user accounts, service accounts and privileged roles, and confirms that each access is still needed for the person's current role. Access that is no longer needed is removed within five business days of the review. Review evidence is retained for audit. Privileged access to production and to the cloud console is additionally reviewed by the Head of Security each quarter.

## Role changes and leavers

When an employee changes role, access that is not required by the new role is removed within five business days. When an employee or contractor leaves, all access is revoked within 24 hours of termination, and immediately for involuntary terminations. Offboarding is triggered automatically by the HR system and includes disabling the single sign-on account, revoking hardware keys, removing the person from all groups, transferring ownership of documents and recovering the company laptop.

## Remote access

Staff work remotely from the European Union and the United Kingdom. Remote access to internal tools requires a managed laptop with full-disk encryption, single sign-on and MFA. There is no network-level trust: every internal application authenticates each request.

## Customer access to the platform

Customers manage their own users in Northbeam Insights. The platform supports single sign-on through SAML and OIDC, enforces MFA for customer administrators, and records every sign-in and permission change in an audit log that customers can export.

## Enforcement

Violations of this policy are reported to the Head of Security and may result in disciplinary action, up to and including termination of employment or contract.
`;

const incidentResponse = `# Incident Response Plan

${SYNTHETIC_NOTE}

Version 2.1. Owner: Head of Security. Approved by the Chief Technology Officer on 14 January 2026.

## Purpose and scope

This plan describes how Northbeam Software detects, responds to, recovers from and learns from security incidents affecting the Northbeam Insights platform, company systems or customer data. A security incident is any event that compromises, or could compromise, the confidentiality, integrity or availability of information. The plan applies to all employees and contractors.

## Roles

The Incident Commander leads the response, makes decisions and keeps the timeline. The Head of Security is the default Incident Commander for security incidents and may delegate the role. The Technical Lead coordinates investigation and remediation. The Communications Lead, normally the Head of Customer Success, drafts customer and public communications, which are approved by the CTO. Legal counsel and the Data Protection Officer are involved whenever personal data may be affected.

## Detection and reporting

Incidents are detected through monitoring alerts, customer reports, vendor notifications and staff reports. Northbeam runs a 24/7 on-call rotation of platform engineers, and alerts page the on-call engineer at any hour. Every employee must report a suspected incident immediately in the security channel or by email to security@northbeam.example. Customers and researchers can report vulnerabilities and incidents to the same address.

## Severity levels

- **SEV-1:** confirmed unauthorised access to customer data, or a full outage of the platform. The response starts immediately and continues around the clock.
- **SEV-2:** a likely compromise of a company system, or a partial outage affecting many customers. Response starts within one hour.
- **SEV-3:** a contained security event with no customer impact, such as a blocked phishing attempt. Response starts within one business day.

## Response process

1. **Triage.** The on-call engineer confirms the alert, assigns a severity and opens an incident channel and ticket.
2. **Containment.** Affected accounts are disabled, credentials and keys are rotated, and affected systems are isolated, while preserving evidence.
3. **Investigation.** The team establishes the cause, the systems and data affected, and the time window, using the centrally collected logs, which are retained for 90 days.
4. **Eradication and recovery.** The root cause is removed, systems are restored from known-good builds or from backups, and monitoring is increased.
5. **Post-incident review.** A blameless review is held within ten business days for every SEV-1 and SEV-2 incident. Actions are tracked to completion.

Evidence such as logs, screenshots and timelines is kept in the incident ticket for at least one year.

## Customer notification

If an incident results in unauthorised access to, or loss of, customer data, Northbeam Software notifies affected customers without undue delay and in any case within 72 hours of confirming the breach. The notification describes what happened, the data involved, the measures taken and the contact point for further information, and is followed by updates as the investigation progresses. Where Northbeam acts as a processor, it supports customers in meeting their own obligations under the GDPR, including their notification to supervisory authorities. Where Northbeam is the controller, the Data Protection Officer notifies the supervisory authority within 72 hours of becoming aware of a personal data breach, as required by Article 33 of the GDPR.

## Communication

Only the Communications Lead and the CTO may speak about an incident outside the company. Status updates for availability incidents are published on the public status page.

## Testing and training

The incident response plan is tested at least annually through a tabletop exercise that simulates a realistic scenario, such as a compromised engineer account or ransomware on a laptop. The most recent exercise took place in February 2026. Lessons learned are recorded and the plan is updated within 30 days. All on-call engineers receive incident response training during onboarding.

## Review

This plan is reviewed annually and after every SEV-1 incident.
`;

const continuity = `# Business Continuity & Disaster Recovery

${SYNTHETIC_NOTE}

Version 1.8. Owner: VP Engineering. Approved by the Chief Technology Officer on 14 January 2026.

## Purpose and scope

This plan explains how Northbeam Software keeps the Northbeam Insights platform available, how it recovers from a disaster, and how the company continues to operate when people, offices or suppliers are unavailable. It covers the production platform, customer data, and the business processes needed to support customers.

## Architecture for resilience

The platform is hosted in Amazon Web Services in the eu-west-1 (Ireland) region. Every production component runs across three availability zones: application servers run in auto-scaling groups behind load balancers, and the primary PostgreSQL database uses Amazon RDS Multi-AZ with automatic failover to a standby replica. The failure of a single server or of a whole availability zone does not cause data loss and is handled automatically. Infrastructure is defined as code, so the entire environment can be rebuilt from version control.

## Backups

Backups are taken daily, encrypted with AES-256 and stored in a separate AWS account with restricted access. In addition, database point-in-time recovery is enabled, allowing recovery to any moment in the retention window. Backups are retained for 35 days and then deleted automatically. Encrypted copies of the daily backups are replicated to a second EU region, eu-central-1 (Frankfurt), so that a regional outage does not prevent recovery. Backups never leave the European Union.

Backup jobs are monitored and a failed backup pages the on-call engineer. A restore of a randomly selected backup is tested every quarter to confirm that backups are complete and usable.

## Recovery objectives

- **Recovery point objective (RPO):** 24 hours for a full regional disaster; in practice point-in-time recovery limits data loss to minutes for most failures.
- **Recovery time objective (RTO):** 8 hours to restore the platform in the secondary region.

These targets are reviewed each year against customer commitments and the results of testing.

## Disaster recovery plan

A disaster is declared by the CTO or the VP Engineering when an outage is expected to exceed four hours or when the primary region is unavailable. The recovery runbook covers rebuilding the infrastructure in eu-central-1 from code, restoring the most recent backup, validating data integrity, updating DNS and communicating with customers through the status page.

## Testing

Disaster recovery is tested annually through a full failover exercise in which the platform is restored in the secondary region from backups and validated against the runbook. The most recent annual disaster recovery test was completed in March 2026: the platform was restored in 5 hours 40 minutes, within the 8-hour RTO. Findings from each test are tracked and the runbook is updated within 30 days.

## Business continuity

Northbeam Software is a remote-first company with staff across the European Union and the United Kingdom, so the loss of any office does not stop operations. All business systems are cloud services accessible from any managed laptop. Critical roles have a documented deputy, and on-call duties rotate across at least four engineers. Contact lists and the recovery runbook are kept in two independent locations.

## Supplier continuity

Critical suppliers are identified in the vendor register. For each critical supplier the vendor management process records its own continuity arrangements and an exit plan. The loss of a non-hosting supplier must not prevent the platform from serving customers.

## Communication

During a disaster, customers are informed through the public status page and by email to their administrators at least every two hours until service is restored. A written incident summary is sent to affected customers within five business days.

## Review

This plan is reviewed annually, after every disaster recovery test, and after any major change to the architecture.
`;

const vendorManagement = `# Vendor Management Policy

${SYNTHETIC_NOTE}

Version 1.6. Owner: Head of Security, with the Finance Lead. Approved by the Chief Technology Officer on 14 January 2026.

## Purpose and scope

Northbeam Software relies on third parties to host and run the Northbeam Insights platform and the business. This policy makes sure those vendors protect our data and our customers' data to the same standard we apply ourselves. It covers every vendor that stores, processes or can access company or customer data, and every vendor whose failure would affect the service.

## Vendor classification

Vendors are classified when they are first proposed:

- **Critical:** processes customer data or is required to run the platform (for example, hosting).
- **High:** processes company confidential or employee data.
- **Low:** no access to non-public data.

The classification decides the depth of review and how often it is repeated.

## Security assessment before onboarding

Before a new critical or high vendor is approved, the Head of Security reviews its security posture. The review includes the vendor's independent audit reports (such as SOC 2 Type II or ISO certifications) where available, its security questionnaire responses, data location, subprocessors, encryption, access controls, incident notification commitments and business continuity arrangements. The outcome, any accepted risks and the contract requirements are recorded in the vendor register. Low vendors require a lighter review by the requesting team.

## Contracts

Every vendor that processes personal data on our behalf signs a data processing agreement that meets Article 28 of the GDPR, including confidentiality, security measures, assistance with data subject requests and breach notification without undue delay. Transfers outside the European Economic Area require an adequacy decision or the EU Standard Contractual Clauses. Contracts with critical vendors include the right to receive audit reports and to terminate if security obligations are not met.

## Ongoing monitoring

Critical vendors are reassessed annually, and high vendors every two years. Reassessment includes reviewing the latest audit report, any security incidents the vendor reported, and changes to its subprocessors or data locations. Vendors that no longer meet our requirements are placed on a remediation plan or replaced.

## Subprocessors

A subprocessor is a vendor that processes customer personal data on behalf of Northbeam Software. Northbeam maintains a public list of subprocessors, which is also attached to the customer data processing agreement. The current subprocessors are:

| Subprocessor | Purpose | Data location |
| --- | --- | --- |
| Amazon Web Services | Hosting, storage and backups | EU (eu-west-1, eu-central-1) |
| Google Workspace | Email and documents for customer communications | EU |
| Datadog | Logging and monitoring | EU |
| Intercom | Customer support messaging | EU |
| Stripe | Subscription billing and payments | EU and US, under the Standard Contractual Clauses |

Northbeam notifies customers at least 30 days before adding or replacing a subprocessor, by email to account administrators and by updating the public list. Customers may object to a new subprocessor on reasonable data protection grounds during that period.

## Payments

Card payments are handled entirely by Stripe. Northbeam Software does not store, process or transmit payment cardholder data on its own systems; customers enter card details directly into Stripe's hosted payment pages.

## Offboarding vendors

When a vendor relationship ends, access is revoked, credentials are rotated and the vendor is asked to return or delete Northbeam data and confirm deletion in writing. The vendor register is updated within ten business days.

## Responsibilities

The requesting team owns each vendor relationship. The Head of Security approves the security review, Finance approves the contract, and the Data Protection Officer approves any vendor that processes personal data.

## Review

This policy and the vendor register are reviewed annually.
`;

const dataRetention = `# Data Retention & Privacy Policy

${SYNTHETIC_NOTE}

Version 2.0. Owner: Data Protection Officer. Approved by the Chief Technology Officer on 14 January 2026.

## Purpose and scope

This policy explains what data Northbeam Software keeps, for how long, and how personal data is protected and deleted. It applies to all customer data in the Northbeam Insights platform, to logs and backups, and to company records containing personal data. Northbeam is a processor for the data customers upload and a controller for its own account, billing and marketing data.

## Privacy principles

Northbeam processes personal data in line with the GDPR and the UK GDPR. We collect only the data needed to provide and support the service, use it only for the purposes agreed with the customer, and keep it only as long as necessary. Northbeam does not sell personal data and does not share customer data with third parties for advertising or marketing. Customer data is never used to train machine learning models.

## Data location

All customer data is stored and processed in the European Union. The production platform runs in AWS eu-west-1 (Ireland), and encrypted backup copies are replicated to AWS eu-central-1 (Frankfurt). Subprocessors and their locations are listed in the Vendor Management Policy and the public subprocessor list.

## Data classification

- **Customer data:** content and personal data uploaded by customers. Highest protection.
- **Confidential:** internal financial, employee and security information.
- **Internal:** day-to-day business information.
- **Public:** information approved for publication.

Customer and confidential data are encrypted at rest with AES-256 and in transit with TLS 1.2 or higher.

## Retention schedule

| Data | Retention |
| --- | --- |
| Customer data in the platform | For the duration of the contract |
| Customer data after termination | Deleted within 30 days of contract termination |
| Backups | 35 days, then deleted automatically |
| Application and security logs | 90 days |
| Audit log exports requested by customers | Retained by the customer |
| Support tickets | 2 years after closure |
| Billing and tax records | 7 years, as required by law |
| Employee records | 6 years after employment ends |

Because backups are retained for 35 days, customer data deleted from the live platform is fully removed from all backups no later than 35 days after deletion.

## Deletion at the end of a contract

When a contract ends, customers can export their data for 30 days. After that period, Northbeam deletes the customer's data from the live platform, and it then expires from backups within the 35-day backup cycle. On request, the Data Protection Officer provides written confirmation of deletion.

## Data subject rights

Northbeam supports customers in responding to data subject requests (access, rectification, erasure, restriction, portability and objection). Requests received directly are forwarded to the customer within two business days. For data where Northbeam is the controller, requests are answered within 30 days.

## Privacy by design

New features that process personal data go through a privacy review as part of the secure development lifecycle. A data protection impact assessment is carried out for high-risk processing. Production customer data is never copied into development or test environments; synthetic data is used instead.

## Breach notification

Personal data breaches are handled under the Incident Response Plan. Affected customers are notified within 72 hours of confirming a breach of their data.

## Disposal

Electronic media is wiped using methods that prevent recovery before reuse or disposal. Laptops are wiped through device management and protected throughout their life by full-disk encryption. Northbeam does not keep paper records containing customer data.

## Contact

The Data Protection Officer can be contacted at privacy@northbeam.example. This policy is reviewed annually.
`;

export const DEMO_POLICIES: DemoPolicy[] = [
  { title: "Information Security Policy", fileName: "information-security-policy.md", markdown: informationSecurity },
  { title: "Access Control Policy", fileName: "access-control-policy.md", markdown: accessControl },
  { title: "Incident Response Plan", fileName: "incident-response-plan.md", markdown: incidentResponse },
  { title: "Business Continuity & Disaster Recovery", fileName: "business-continuity-disaster-recovery.md", markdown: continuity },
  { title: "Vendor Management Policy", fileName: "vendor-management-policy.md", markdown: vendorManagement },
  { title: "Data Retention & Privacy Policy", fileName: "data-retention-privacy-policy.md", markdown: dataRetention },
];
