-- CreateTable
CREATE TABLE "ins_company" (
    "id" TEXT NOT NULL,
    "company_code" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "company_type" TEXT NOT NULL,
    "parent_code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ins_company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ins_product" (
    "id" TEXT NOT NULL,
    "product_code" TEXT NOT NULL,
    "product_name" TEXT NOT NULL,
    "product_type" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ins_product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ins_coverage_type" (
    "id" TEXT NOT NULL,
    "product_id" TEXT NOT NULL,
    "coverage_code" TEXT NOT NULL,
    "coverage_name" TEXT NOT NULL,
    "coverage_desc" TEXT,
    "limit_amount" DECIMAL(18,2) NOT NULL,
    "deductible" DECIMAL(18,2) NOT NULL DEFAULT 0,

    CONSTRAINT "ins_coverage_type_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party" (
    "id" TEXT NOT NULL,
    "party_type" TEXT NOT NULL,
    "id_type" TEXT NOT NULL,
    "id_no" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" TEXT,
    "birth_date" TIMESTAMP(3),
    "nationality" TEXT,
    "occupation" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_contact" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "contact_type" TEXT NOT NULL,
    "contact_value" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "party_contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "party_bank_account" (
    "id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "bank_code" TEXT,
    "branch_name" TEXT,
    "account_no" TEXT NOT NULL,
    "account_name" TEXT NOT NULL,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "party_bank_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy" (
    "id" TEXT NOT NULL,
    "policy_no" TEXT NOT NULL,
    "proposal_no" TEXT,
    "product_id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "holder_id" TEXT NOT NULL,
    "policy_status" TEXT NOT NULL DEFAULT 'VALID',
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "issue_date" TIMESTAMP(3) NOT NULL,
    "premium" DECIMAL(18,2) NOT NULL,
    "insured_amount" DECIMAL(18,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_insured" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "insured_type" TEXT NOT NULL DEFAULT 'PRIMARY',
    "insured_amount" DECIMAL(18,2),
    "occupation_code" TEXT,
    "occupation_level" INTEGER,

    CONSTRAINT "policy_insured_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_beneficiary" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "benefit_ratio" DECIMAL(5,2) NOT NULL DEFAULT 100,
    "benefit_order" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "policy_beneficiary_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_subject" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "subject_type" TEXT NOT NULL,
    "subject_code" TEXT,
    "subject_name" TEXT NOT NULL,
    "subject_value" DECIMAL(18,2),
    "address" TEXT,
    "attributes" JSONB,

    CONSTRAINT "policy_subject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_coverage" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "coverage_type_id" TEXT NOT NULL,
    "limit_amount" DECIMAL(18,2) NOT NULL,
    "deductible" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "premium" DECIMAL(18,2),

    CONSTRAINT "policy_coverage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fnol" (
    "id" TEXT NOT NULL,
    "fnol_no" TEXT NOT NULL,
    "report_time" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "report_channel" TEXT NOT NULL DEFAULT 'SYSTEM',
    "reporter_name" TEXT NOT NULL,
    "reporter_phone" TEXT NOT NULL,
    "reporter_relation" TEXT,
    "accident_time" TIMESTAMP(3) NOT NULL,
    "accident_location" TEXT NOT NULL,
    "accident_desc" TEXT NOT NULL,
    "accident_type" TEXT NOT NULL,
    "policy_no" TEXT,
    "estimated_amount" DECIMAL(18,2),
    "fnol_status" TEXT NOT NULL DEFAULT 'NEW',
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fnol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_case" (
    "id" TEXT NOT NULL,
    "case_no" TEXT NOT NULL,
    "fnol_id" TEXT,
    "policy_id" TEXT,
    "accident_time" TIMESTAMP(3) NOT NULL,
    "accident_location" TEXT NOT NULL,
    "accident_type" TEXT NOT NULL,
    "accident_desc" TEXT,
    "case_status" TEXT NOT NULL DEFAULT 'PENDING_SPLIT',
    "has_litigation" BOOLEAN NOT NULL DEFAULT false,
    "litigation_desc" TEXT,
    "liability_ratio" DECIMAL(5,2),
    "has_investigation" BOOLEAN NOT NULL DEFAULT false,
    "investigation_blocking" BOOLEAN NOT NULL DEFAULT false,
    "reg_amount" DECIMAL(18,2),
    "assessed_amount" DECIMAL(18,2),
    "paid_amount" DECIMAL(18,2),
    "reg_approved_time" TIMESTAMP(3),
    "agreement_approved_time" TIMESTAMP(3),
    "survey_approved_time" TIMESTAMP(3),
    "closed_time" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_case_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_party" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "party_id" TEXT NOT NULL,
    "party_role" TEXT NOT NULL,
    "injury_level" TEXT,
    "is_rider" BOOLEAN NOT NULL DEFAULT false,
    "rider_type" TEXT,

    CONSTRAINT "claim_party_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_task" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "task_no" TEXT NOT NULL,
    "task_type" TEXT NOT NULL,
    "insurance_type" TEXT NOT NULL,
    "business_line" TEXT NOT NULL,
    "task_status" TEXT NOT NULL DEFAULT 'PENDING',
    "flow_status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "assigned_to" TEXT,
    "assessed_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "approved_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claim_task_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "investigation" (
    "id" TEXT NOT NULL,
    "investigation_no" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "investigator" TEXT NOT NULL,
    "investigation_time" TIMESTAMP(3) NOT NULL,
    "investigation_type" TEXT NOT NULL DEFAULT 'FIELD',
    "location" TEXT,
    "conclusion" TEXT,
    "is_fraud_suspected" BOOLEAN NOT NULL DEFAULT false,
    "fraud_desc" TEXT,
    "inv_status" TEXT NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "investigation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_assessment" (
    "id" TEXT NOT NULL,
    "assessment_no" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "assessor" TEXT NOT NULL,
    "assessment_time" TIMESTAMP(3) NOT NULL,
    "total_loss" DECIMAL(18,2) NOT NULL,
    "deductible" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "net_loss" DECIMAL(18,2) NOT NULL,
    "assessment_status" TEXT NOT NULL DEFAULT 'DRAFT',
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loss_assessment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loss_item" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "assessment_id" TEXT,
    "loss_category" TEXT NOT NULL,
    "loss_type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "claimed_amount" DECIMAL(18,2) NOT NULL,
    "standard_amount" DECIMAL(18,2),
    "approved_amount" DECIMAL(18,2),
    "duration" INTEGER,
    "daily_rate" DECIMAL(18,2),
    "formula" TEXT,
    "is_audited" BOOLEAN NOT NULL DEFAULT false,
    "remark" TEXT,

    CONSTRAINT "loss_item_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medical_record" (
    "id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "hospital_code" TEXT,
    "hospital_name" TEXT NOT NULL,
    "admission_date" TIMESTAMP(3),
    "discharge_date" TIMESTAMP(3),
    "hospitalized_days" INTEGER,
    "diagnosis_code" TEXT,
    "diagnosis_name" TEXT NOT NULL,
    "injury_part" TEXT,
    "injury_degree" TEXT,
    "treatment_desc" TEXT,
    "medical_expense" DECIMAL(18,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medical_record_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_review" (
    "id" TEXT NOT NULL,
    "review_no" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "reviewer" TEXT NOT NULL,
    "review_time" TIMESTAMP(3) NOT NULL,
    "review_type" TEXT NOT NULL DEFAULT 'INITIAL',
    "approved_amount" DECIMAL(18,2) NOT NULL,
    "decision" TEXT NOT NULL,
    "decision_reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_review_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment" (
    "id" TEXT NOT NULL,
    "payment_no" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "bank_account_id" TEXT,
    "payment_type" TEXT NOT NULL,
    "payment_amount" DECIMAL(18,2) NOT NULL,
    "payee_name" TEXT NOT NULL,
    "payee_id_no" TEXT,
    "bank_name" TEXT,
    "bank_account" TEXT,
    "payment_status" TEXT NOT NULL DEFAULT 'PENDING',
    "payment_time" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subrogation" (
    "id" TEXT NOT NULL,
    "subrogation_no" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "subrogation_type" TEXT NOT NULL,
    "target_name" TEXT NOT NULL,
    "target_id_no" TEXT,
    "claimed_amount" DECIMAL(18,2) NOT NULL,
    "recovered_amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "sub_status" TEXT NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "concluded_at" TIMESTAMP(3),
    "remark" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subrogation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "claim_document" (
    "id" TEXT NOT NULL,
    "case_id" TEXT NOT NULL,
    "task_id" TEXT,
    "doc_category" TEXT NOT NULL,
    "doc_type" TEXT NOT NULL,
    "doc_name" TEXT NOT NULL,
    "file_type" TEXT NOT NULL,
    "file_size" INTEGER,
    "file_url" TEXT,
    "file_data" TEXT,
    "ocr_status" TEXT,
    "ocr_result" JSONB,
    "uploader" TEXT,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospital" (
    "id" TEXT NOT NULL,
    "hospital_code" TEXT NOT NULL,
    "hospital_name" TEXT NOT NULL,
    "hospital_level" TEXT,
    "hospital_type" TEXT,
    "province" TEXT,
    "city" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "is_designated" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hospital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "icd10_code" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name_cn" TEXT NOT NULL,
    "name_en" TEXT,
    "category" TEXT,
    "parent_code" TEXT,
    "is_leaf" BOOLEAN NOT NULL DEFAULT true,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "icd10_code_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "work_injury_standard" (
    "id" TEXT NOT NULL,
    "standard_code" TEXT NOT NULL,
    "standard_name" TEXT NOT NULL,
    "standard_type" TEXT NOT NULL,
    "base_amount" DECIMAL(18,2),
    "multiplier" DECIMAL(8,4),
    "max_amount" DECIMAL(18,2),
    "min_amount" DECIMAL(18,2),
    "disability_level" INTEGER,
    "region" TEXT,
    "effective_date" TIMESTAMP(3) NOT NULL,
    "expire_date" TIMESTAMP(3),
    "law_reference" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_injury_standard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sys_user" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "department" TEXT,
    "role" TEXT NOT NULL DEFAULT 'STAFF',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sys_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" TEXT NOT NULL,
    "case_id" TEXT,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "operator" TEXT NOT NULL,
    "operator_ip" TEXT,
    "detail" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_kv_store" (
    "kv_namespace" TEXT NOT NULL,
    "kv_key" TEXT NOT NULL,
    "kv_value" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "app_kv_store_pkey" PRIMARY KEY ("kv_namespace","kv_key")
);

-- CreateIndex
CREATE UNIQUE INDEX "ins_company_company_code_key" ON "ins_company"("company_code");

-- CreateIndex
CREATE UNIQUE INDEX "ins_product_product_code_key" ON "ins_product"("product_code");

-- CreateIndex
CREATE INDEX "ins_product_company_id_idx" ON "ins_product"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "ins_coverage_type_product_id_coverage_code_key" ON "ins_coverage_type"("product_id", "coverage_code");

-- CreateIndex
CREATE INDEX "party_name_idx" ON "party"("name");

-- CreateIndex
CREATE UNIQUE INDEX "party_id_type_id_no_key" ON "party"("id_type", "id_no");

-- CreateIndex
CREATE INDEX "party_contact_party_id_idx" ON "party_contact"("party_id");

-- CreateIndex
CREATE INDEX "party_bank_account_party_id_idx" ON "party_bank_account"("party_id");

-- CreateIndex
CREATE UNIQUE INDEX "policy_policy_no_key" ON "policy"("policy_no");

-- CreateIndex
CREATE UNIQUE INDEX "policy_proposal_no_key" ON "policy"("proposal_no");

-- CreateIndex
CREATE INDEX "policy_policy_status_idx" ON "policy"("policy_status");

-- CreateIndex
CREATE INDEX "policy_start_date_end_date_idx" ON "policy"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "policy_holder_id_idx" ON "policy"("holder_id");

-- CreateIndex
CREATE INDEX "policy_insured_policy_id_idx" ON "policy_insured"("policy_id");

-- CreateIndex
CREATE INDEX "policy_insured_party_id_idx" ON "policy_insured"("party_id");

-- CreateIndex
CREATE INDEX "policy_beneficiary_policy_id_idx" ON "policy_beneficiary"("policy_id");

-- CreateIndex
CREATE INDEX "policy_subject_policy_id_idx" ON "policy_subject"("policy_id");

-- CreateIndex
CREATE INDEX "policy_coverage_policy_id_idx" ON "policy_coverage"("policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "fnol_fnol_no_key" ON "fnol"("fnol_no");

-- CreateIndex
CREATE INDEX "fnol_report_time_idx" ON "fnol"("report_time");

-- CreateIndex
CREATE INDEX "fnol_fnol_status_idx" ON "fnol"("fnol_status");

-- CreateIndex
CREATE UNIQUE INDEX "claim_case_case_no_key" ON "claim_case"("case_no");

-- CreateIndex
CREATE UNIQUE INDEX "claim_case_fnol_id_key" ON "claim_case"("fnol_id");

-- CreateIndex
CREATE INDEX "claim_case_case_status_idx" ON "claim_case"("case_status");

-- CreateIndex
CREATE INDEX "claim_case_case_status_created_at_idx" ON "claim_case"("case_status", "created_at");

-- CreateIndex
CREATE INDEX "claim_case_accident_time_idx" ON "claim_case"("accident_time");

-- CreateIndex
CREATE INDEX "claim_case_created_at_idx" ON "claim_case"("created_at");

-- CreateIndex
CREATE INDEX "claim_party_case_id_idx" ON "claim_party"("case_id");

-- CreateIndex
CREATE INDEX "claim_party_case_id_is_rider_idx" ON "claim_party"("case_id", "is_rider");

-- CreateIndex
CREATE UNIQUE INDEX "claim_task_task_no_key" ON "claim_task"("task_no");

-- CreateIndex
CREATE INDEX "claim_task_case_id_idx" ON "claim_task"("case_id");

-- CreateIndex
CREATE INDEX "claim_task_task_status_idx" ON "claim_task"("task_status");

-- CreateIndex
CREATE UNIQUE INDEX "investigation_investigation_no_key" ON "investigation"("investigation_no");

-- CreateIndex
CREATE INDEX "investigation_case_id_idx" ON "investigation"("case_id");

-- CreateIndex
CREATE UNIQUE INDEX "loss_assessment_assessment_no_key" ON "loss_assessment"("assessment_no");

-- CreateIndex
CREATE INDEX "loss_assessment_task_id_idx" ON "loss_assessment"("task_id");

-- CreateIndex
CREATE INDEX "loss_item_task_id_idx" ON "loss_item"("task_id");

-- CreateIndex
CREATE INDEX "loss_item_assessment_id_idx" ON "loss_item"("assessment_id");

-- CreateIndex
CREATE INDEX "medical_record_task_id_idx" ON "medical_record"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "claim_review_review_no_key" ON "claim_review"("review_no");

-- CreateIndex
CREATE INDEX "claim_review_task_id_idx" ON "claim_review"("task_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_payment_no_key" ON "payment"("payment_no");

-- CreateIndex
CREATE INDEX "payment_task_id_idx" ON "payment"("task_id");

-- CreateIndex
CREATE INDEX "payment_payment_status_idx" ON "payment"("payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "subrogation_subrogation_no_key" ON "subrogation"("subrogation_no");

-- CreateIndex
CREATE INDEX "subrogation_case_id_idx" ON "subrogation"("case_id");

-- CreateIndex
CREATE INDEX "claim_document_case_id_idx" ON "claim_document"("case_id");

-- CreateIndex
CREATE INDEX "claim_document_doc_category_idx" ON "claim_document"("doc_category");

-- CreateIndex
CREATE UNIQUE INDEX "hospital_hospital_code_key" ON "hospital"("hospital_code");

-- CreateIndex
CREATE INDEX "hospital_province_city_idx" ON "hospital"("province", "city");

-- CreateIndex
CREATE INDEX "hospital_hospital_name_idx" ON "hospital"("hospital_name");

-- CreateIndex
CREATE UNIQUE INDEX "icd10_code_code_key" ON "icd10_code"("code");

-- CreateIndex
CREATE INDEX "icd10_code_category_idx" ON "icd10_code"("category");

-- CreateIndex
CREATE INDEX "icd10_code_name_cn_idx" ON "icd10_code"("name_cn");

-- CreateIndex
CREATE UNIQUE INDEX "work_injury_standard_standard_code_key" ON "work_injury_standard"("standard_code");

-- CreateIndex
CREATE INDEX "work_injury_standard_standard_type_idx" ON "work_injury_standard"("standard_type");

-- CreateIndex
CREATE INDEX "work_injury_standard_disability_level_idx" ON "work_injury_standard"("disability_level");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_username_key" ON "sys_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "sys_user_email_key" ON "sys_user"("email");

-- CreateIndex
CREATE INDEX "audit_log_entity_type_entity_id_idx" ON "audit_log"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_case_id_idx" ON "audit_log"("case_id");

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- AddForeignKey
ALTER TABLE "ins_product" ADD CONSTRAINT "ins_product_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ins_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ins_coverage_type" ADD CONSTRAINT "ins_coverage_type_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ins_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_contact" ADD CONSTRAINT "party_contact_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "party_bank_account" ADD CONSTRAINT "party_bank_account_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy" ADD CONSTRAINT "policy_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "ins_product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy" ADD CONSTRAINT "policy_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "ins_company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy" ADD CONSTRAINT "policy_holder_id_fkey" FOREIGN KEY ("holder_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_insured" ADD CONSTRAINT "policy_insured_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_insured" ADD CONSTRAINT "policy_insured_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_beneficiary" ADD CONSTRAINT "policy_beneficiary_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_beneficiary" ADD CONSTRAINT "policy_beneficiary_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_subject" ADD CONSTRAINT "policy_subject_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_coverage" ADD CONSTRAINT "policy_coverage_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_coverage" ADD CONSTRAINT "policy_coverage_coverage_type_id_fkey" FOREIGN KEY ("coverage_type_id") REFERENCES "ins_coverage_type"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_case" ADD CONSTRAINT "claim_case_fnol_id_fkey" FOREIGN KEY ("fnol_id") REFERENCES "fnol"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_case" ADD CONSTRAINT "claim_case_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policy"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_party" ADD CONSTRAINT "claim_party_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_party" ADD CONSTRAINT "claim_party_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "party"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_task" ADD CONSTRAINT "claim_task_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "investigation" ADD CONSTRAINT "investigation_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_assessment" ADD CONSTRAINT "loss_assessment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "claim_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_item" ADD CONSTRAINT "loss_item_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "claim_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loss_item" ADD CONSTRAINT "loss_item_assessment_id_fkey" FOREIGN KEY ("assessment_id") REFERENCES "loss_assessment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "medical_record" ADD CONSTRAINT "medical_record_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "claim_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_review" ADD CONSTRAINT "claim_review_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "claim_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "claim_task"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment" ADD CONSTRAINT "payment_bank_account_id_fkey" FOREIGN KEY ("bank_account_id") REFERENCES "party_bank_account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subrogation" ADD CONSTRAINT "subrogation_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_document" ADD CONSTRAINT "claim_document_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_case_id_fkey" FOREIGN KEY ("case_id") REFERENCES "claim_case"("id") ON DELETE SET NULL ON UPDATE CASCADE;

