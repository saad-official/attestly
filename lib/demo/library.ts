/**
 * Twelve previously approved answers for the demo answer library (spec 3.7),
 * as if imported from a past questionnaire. They agree with the demo policies
 * and deliberately do not cover the topics the demo questionnaire leaves
 * uncovered, so those still come back as needs_evidence.
 */

export type DemoLibraryAnswer = {
  question: string;
  answer: string;
};

export const DEMO_LIBRARY_SOURCE = "Globex vendor assessment, March 2026 (synthetic)";

export const DEMO_LIBRARY: DemoLibraryAnswer[] = [
  {
    question: "Is multi-factor authentication required to access your systems?",
    answer:
      "Yes. MFA is enforced on all systems through Google Workspace single sign-on, and engineers with production access use hardware security keys.",
  },
  {
    question: "How often do you review user access?",
    answer: "System owners review all user, service and privileged accounts quarterly, and unneeded access is removed within five business days.",
  },
  {
    question: "Where is customer data stored?",
    answer:
      "In the European Union. Production runs in AWS eu-west-1 (Ireland) and encrypted backup copies are replicated to AWS eu-central-1 (Frankfurt).",
  },
  {
    question: "How is customer data encrypted?",
    answer: "Customer data is encrypted at rest with AES-256 using AWS KMS-managed keys, and in transit with TLS 1.2 or higher.",
  },
  {
    question: "Describe your backup strategy.",
    answer:
      "Backups are taken daily, encrypted with AES-256, stored in a separate AWS account and retained for 35 days. Restores are tested every quarter.",
  },
  {
    question: "Do you have a disaster recovery plan and is it tested?",
    answer:
      "Yes. The disaster recovery plan is tested annually with a full failover to eu-central-1. The March 2026 test restored service in 5 hours 40 minutes against an 8-hour RTO.",
  },
  {
    question: "What is your breach notification commitment?",
    answer: "We notify affected customers without undue delay and in any case within 72 hours of confirming a breach of their data.",
  },
  {
    question: "Do you have a SOC 2 report?",
    answer:
      "Not yet. A SOC 2 Type II audit is planned, with the observation window starting in Q1 2027. Our policies and a penetration test summary are available under NDA.",
  },
  {
    question: "Are employees screened before hire?",
    answer: "Yes. Background checks covering identity, right to work, employment history and, where lawful, criminal records are completed before the start date.",
  },
  {
    question: "Do you use subprocessors?",
    answer:
      "Yes: AWS, Google Workspace, Datadog, Intercom and Stripe. The list is public and customers are notified 30 days before any change.",
  },
  {
    question: "How long are logs kept?",
    answer: "Application, infrastructure and authentication logs are kept centrally in Datadog for 90 days and then deleted automatically.",
  },
  {
    question: "Do you perform penetration testing?",
    answer:
      "Yes. An independent third party tests the platform at least annually; the latest test was in November 2025 and all high findings were fixed within 30 days.",
  },
];
