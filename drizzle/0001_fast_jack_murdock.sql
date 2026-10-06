CREATE TABLE `pie` (
	`id` integer PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`icon` text,
	`value_cents` integer NOT NULL,
	`invested_cents` integer NOT NULL,
	`result_cents` integer NOT NULL,
	`return_pct` real,
	`cash_cents` integer DEFAULT 0 NOT NULL,
	`dividends_gained_cents` integer DEFAULT 0 NOT NULL,
	`dividends_reinvested_cents` integer DEFAULT 0 NOT NULL,
	`dividends_in_cash_cents` integer DEFAULT 0 NOT NULL,
	`dividend_cash_action` text,
	`goal_cents` integer,
	`progress` real,
	`status` text,
	`initial_investment_cents` integer,
	`created_at` integer,
	`end_at` integer,
	`public_url` text,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `pie_instrument` (
	`pie_id` integer NOT NULL,
	`ticker` text NOT NULL,
	`quantity` real NOT NULL,
	`expected_share` real NOT NULL,
	`current_share` real NOT NULL,
	`value_cents` integer NOT NULL,
	`invested_cents` integer NOT NULL,
	`result_cents` integer NOT NULL,
	`return_pct` real,
	`issues` text NOT NULL,
	PRIMARY KEY(`pie_id`, `ticker`),
	FOREIGN KEY (`pie_id`) REFERENCES `pie`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_pie_instrument_ticker` ON `pie_instrument` (`ticker`);--> statement-breakpoint
ALTER TABLE `t212_context` ADD `pies_synced_at` integer;--> statement-breakpoint
ALTER TABLE `t212_context` ADD `pies_error` text;