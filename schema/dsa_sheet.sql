-- NEW DSA SCHEMA DEFINITION

CREATE SCHEMA IF NOT EXISTS "public";

CREATE TABLE IF NOT EXISTS "companies" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL CONSTRAINT "companies_slug_key" UNIQUE,
	"logo_url" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dsa_topics" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dsa_patterns" (
	"id" serial PRIMARY KEY,
	"topic_id" integer NOT NULL REFERENCES "dsa_topics"("id") ON DELETE CASCADE,
	"name" varchar(255) NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dsa_problems" (
	"id" serial PRIMARY KEY,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL CONSTRAINT "dsa_problems_slug_key" UNIQUE,
	"link" text NOT NULL,
	"difficulty" varchar(20) NOT NULL,
	"acceptance_rate" numeric(7, 6),
	"rating" numeric(6, 2),
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dsa_pattern_problems" (
	"id" serial PRIMARY KEY,
	"pattern_id" integer NOT NULL REFERENCES "dsa_patterns"("id") ON DELETE CASCADE,
	"problem_id" integer NOT NULL REFERENCES "dsa_problems"("id") ON DELETE CASCADE,
	"priority_order" integer DEFAULT 0,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT "dsa_pattern_problems_unique" UNIQUE("pattern_id","problem_id")
);

CREATE TABLE IF NOT EXISTS "dsa_sheets" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL CONSTRAINT "dsa_sheets_slug_key" UNIQUE,
	"description" text,
	"is_public" boolean DEFAULT true,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "dsa_sheet_items" (
	"id" serial PRIMARY KEY,
	"sheet_id" integer NOT NULL REFERENCES "dsa_sheets"("id") ON DELETE CASCADE,
	"topic_id" integer REFERENCES "dsa_topics"("id") ON DELETE CASCADE,
	"pattern_id" integer REFERENCES "dsa_patterns"("id") ON DELETE CASCADE,
	"problem_id" integer NOT NULL REFERENCES "dsa_problems"("id") ON DELETE CASCADE,
	"priority_order" integer DEFAULT 0,
	"section_name" varchar(255),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "topics" (
	"id" serial PRIMARY KEY,
	"name" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL CONSTRAINT "topics_slug_key" UNIQUE,
	"link" text
);

CREATE TABLE IF NOT EXISTS "problem_companies" (
	"problem_id" integer REFERENCES "dsa_problems"("id") ON DELETE CASCADE,
	"company_id" integer REFERENCES "companies"("id") ON DELETE CASCADE,
	CONSTRAINT "problem_companies_pkey" PRIMARY KEY("problem_id","company_id")
);

CREATE TABLE IF NOT EXISTS "problem_topics" (
	"problem_id" integer REFERENCES "dsa_problems"("id") ON DELETE CASCADE,
	"topic_id" integer REFERENCES "topics"("id") ON DELETE CASCADE,
	CONSTRAINT "problem_topics_pkey" PRIMARY KEY("problem_id","topic_id")
);

CREATE TABLE IF NOT EXISTS "dsa_user_problem_status" (
	"id" serial PRIMARY KEY,
	"user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
	"problem_id" integer NOT NULL REFERENCES "dsa_problems"("id") ON DELETE CASCADE,
	"completed" boolean DEFAULT false,
	"revised" boolean DEFAULT false,
	"bookmarked" boolean DEFAULT false,
	"attempts" integer DEFAULT 0,
	"last_solved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"updated_at" timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
	"user_note" text DEFAULT '',
	CONSTRAINT "dsa_user_problem_status_unique" UNIQUE("user_id", "problem_id")
);
