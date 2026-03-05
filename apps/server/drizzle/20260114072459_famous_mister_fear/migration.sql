CREATE TABLE "role_menu_visibility" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"menu_id" text NOT NULL,
	"organization_id" text,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "role_menu_visibility" ADD CONSTRAINT "role_menu_visibility_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_visibility" ADD CONSTRAINT "role_menu_visibility_menu_id_menus_id_fk" FOREIGN KEY ("menu_id") REFERENCES "public"."menus"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_menu_visibility" ADD CONSTRAINT "role_menu_visibility_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_role_menu_visibility" ON "role_menu_visibility" USING btree ("role_id","menu_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_rmv_org_role" ON "role_menu_visibility" USING btree ("organization_id","role_id");--> statement-breakpoint
CREATE INDEX "idx_rmv_menu_org" ON "role_menu_visibility" USING btree ("menu_id","organization_id");--> statement-breakpoint
CREATE INDEX "idx_rmv_role_id" ON "role_menu_visibility" USING btree ("role_id");