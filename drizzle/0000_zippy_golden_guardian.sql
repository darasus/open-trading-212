CREATE TABLE `account_snapshot` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`taken_at` integer NOT NULL,
	`currency` text NOT NULL,
	`total_cents` integer NOT NULL,
	`invested_cents` integer NOT NULL,
	`positions_value_cents` integer NOT NULL,
	`unrealized_cents` integer NOT NULL,
	`realized_cents` integer NOT NULL,
	`cash_cents` integer NOT NULL,
	`reserved_cents` integer DEFAULT 0 NOT NULL,
	`in_pies_cents` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_snapshot_taken` ON `account_snapshot` (`taken_at`);--> statement-breakpoint
CREATE TABLE `cash_transaction` (
	`reference` text PRIMARY KEY NOT NULL,
	`type` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`currency` text NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_cash_at` ON `cash_transaction` (`at`);--> statement-breakpoint
CREATE TABLE `chat` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`messages` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `dividend` (
	`reference` text PRIMARY KEY NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`quantity` real,
	`amount_cents` integer NOT NULL,
	`gross_per_share` real,
	`ticker_currency` text,
	`type` text,
	`paid_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_dividend_paid` ON `dividend` (`paid_at`);--> statement-breakpoint
CREATE INDEX `idx_dividend_ticker` ON `dividend` (`ticker`,`paid_at`);--> statement-breakpoint
CREATE TABLE `history_cursor` (
	`stream` text PRIMARY KEY NOT NULL,
	`next_path` text,
	`backfill_done` integer DEFAULT false NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `instrument` (
	`ticker` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`short_name` text,
	`isin` text,
	`currency` text,
	`type` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_instrument_isin` ON `instrument` (`isin`);--> statement-breakpoint
CREATE TABLE `order` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`name` text NOT NULL,
	`side` text NOT NULL,
	`type` text NOT NULL,
	`status` text NOT NULL,
	`fill_type` text,
	`quantity` real,
	`price` real,
	`instrument_currency` text,
	`amount_cents` integer DEFAULT 0 NOT NULL,
	`realized_cents` integer DEFAULT 0 NOT NULL,
	`fees_cents` integer DEFAULT 0 NOT NULL,
	`fx_rate` real,
	`initiated_from` text,
	`created_at` integer NOT NULL,
	`at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_order_at` ON `order` (`at`);--> statement-breakpoint
CREATE INDEX `idx_order_ticker` ON `order` (`ticker`,`at`);--> statement-breakpoint
CREATE TABLE `position` (
	`ticker` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`isin` text,
	`instrument_currency` text,
	`quantity` real NOT NULL,
	`quantity_in_pies` real DEFAULT 0 NOT NULL,
	`average_price` real NOT NULL,
	`current_price` real NOT NULL,
	`value_cents` integer NOT NULL,
	`cost_cents` integer NOT NULL,
	`unrealized_cents` integer NOT NULL,
	`fx_cents` integer DEFAULT 0 NOT NULL,
	`opened_at` integer,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `setting` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_run` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` integer NOT NULL,
	`finished_at` integer,
	`status` text NOT NULL,
	`positions_synced` integer DEFAULT 0 NOT NULL,
	`activities_synced` integer DEFAULT 0 NOT NULL,
	`error` text
);
--> statement-breakpoint
CREATE TABLE `t212_context` (
	`id` integer PRIMARY KEY NOT NULL,
	`environment` text NOT NULL,
	`account_id` integer,
	`currency` text,
	`connected_at` integer NOT NULL,
	`last_synced_at` integer,
	`instruments_synced_at` integer
);
