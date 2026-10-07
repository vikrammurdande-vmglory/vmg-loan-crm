# Loan Agency CRM

Production-oriented MVP for loan agencies: RBAC login, dashboard, leads/customers, loan applications, lenders, follow-ups, commissions, document metadata, and a CIBIL PDF Analyzer.

## CIBIL PDF Analyzer
Select a customer under **Credit Reports**, upload a text-based CIBIL PDF, and the CRM extracts score, active/closed accounts, outstanding, estimated monthly EMI, overdue/DPD, credit cards, enquiries, settlements/write-offs, loan-wise obligations and red flags. A configurable FOIR calculator combines reported existing EMI with proposed EMI.

The original report is retained and protected behind authentication. In production, set an S3 bucket so reports are stored encrypted in S3. Scanned/image-only PDFs are flagged for OCR/manual review rather than silently inventing values. The extraction is an assistive CRM summary and must be verified against the original bureau report before underwriting decisions.

## Run locally
1. Copy `.env.example` to `.env`.
2. `docker compose up --build`
3. Open http://localhost:5173
4. Login: `admin@example.com` / `ChangeMe123!`

## Production
Use PostgreSQL/RDS and S3. Set `DATABASE_URL`, `JWT_SECRET`, `AWS_REGION`, `S3_BUCKET` and AWS credentials via ECS task role. Run migrations with `npm run migrate` from backend.

This repository is an MVP foundation; before handling real customer identity/financial documents, complete organization-specific compliance, retention, consent, access-review and security testing.
