import { MigrationInterface, QueryRunner } from "typeorm";

export class InitialSchema1777655090778 implements MigrationInterface {
    name = 'InitialSchema1777655090778'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE \`schools\` (\`id\` int NOT NULL AUTO_INCREMENT, \`name\` varchar(150) NOT NULL, \`address\` varchar(255) NULL, \`phone\` varchar(20) NULL, \`logo_url\` text NULL, \`timezone\` varchar(50) NOT NULL DEFAULT 'Asia/Hebron', \`status\` enum ('active', 'inactive') NOT NULL DEFAULT 'active', \`settings\` json NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`roles\` (\`id\` int NOT NULL AUTO_INCREMENT, \`slug\` varchar(50) NOT NULL, \`name_ar\` varchar(100) NOT NULL, \`name_en\` varchar(100) NOT NULL, \`description\` varchar(255) NULL, \`level\` tinyint NOT NULL DEFAULT '0', UNIQUE INDEX \`IDX_881f72bac969d9a00a1a29e107\` (\`slug\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`user_roles\` (\`user_id\` int NOT NULL, \`role_id\` int NOT NULL, \`assigned_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`assigned_by\` int NULL, INDEX \`IDX_b23c65e50a758245a33ee35fda\` (\`role_id\`), PRIMARY KEY (\`user_id\`, \`role_id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`school_id\` int NOT NULL, \`name\` varchar(100) NOT NULL, \`email\` varchar(255) NOT NULL, \`password\` varchar(255) NOT NULL, \`phone\` varchar(20) NULL, \`photo_url\` text NULL, \`email_verified_at\` datetime(6) NULL, \`last_login_at\` datetime(6) NULL, \`status\` enum ('active', 'inactive', 'suspended') NOT NULL DEFAULT 'active', \`token_version\` int NOT NULL DEFAULT '0', \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updated_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), \`deleted_at\` datetime(6) NULL, INDEX \`idx_user_school_status\` (\`school_id\`, \`status\`), UNIQUE INDEX \`idx_user_email_school\` (\`email\`, \`school_id\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`audit_logs\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`actor_user_id\` int NULL, \`actor_role\` varchar(50) NULL, \`school_id\` int NULL, \`action\` varchar(100) NOT NULL, \`entity_type\` varchar(50) NOT NULL, \`entity_id\` bigint NULL, \`old_values\` json NULL, \`new_values\` json NULL, \`ip_address\` varchar(45) NULL, \`user_agent\` varchar(500) NULL, \`description\` text NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_school_time\` (\`school_id\`, \`created_at\`), INDEX \`idx_action\` (\`action\`, \`created_at\`), INDEX \`idx_entity\` (\`entity_type\`, \`entity_id\`, \`created_at\`), INDEX \`idx_actor\` (\`actor_user_id\`, \`created_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`refresh_tokens\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`token_hash\` char(64) NOT NULL, \`family_id\` char(36) NOT NULL, \`parent_id\` bigint NULL, \`device_name\` varchar(100) NULL, \`device_type\` enum ('web', 'mobile_ios', 'mobile_android', 'desktop', 'other') NOT NULL DEFAULT 'web', \`user_agent\` varchar(500) NULL, \`ip_address\` varchar(45) NULL, \`issued_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`expires_at\` datetime(6) NOT NULL, \`last_used_at\` datetime(6) NULL, \`revoked_at\` datetime(6) NULL, \`revoked_reason\` enum ('logout', 'rotation', 'password_change', 'admin_action', 'suspicious_activity', 'expired') NULL, \`replaced_by_id\` bigint NULL, UNIQUE INDEX \`IDX_a7838d2ba25be1342091b6695f\` (\`token_hash\`), INDEX \`idx_cleanup\` (\`expires_at\`), INDEX \`idx_family\` (\`family_id\`), INDEX \`idx_user_active\` (\`user_id\`, \`revoked_at\`, \`expires_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`login_attempts\` (\`id\` bigint NOT NULL AUTO_INCREMENT, \`email\` varchar(255) NOT NULL, \`user_id\` int NULL, \`school_id\` int NULL, \`status\` enum ('success', 'wrong_password', 'user_not_found', 'account_locked', 'account_inactive', 'rate_limited') NOT NULL, \`failure_reason\` varchar(255) NULL, \`ip_address\` varchar(45) NOT NULL, \`user_agent\` varchar(500) NULL, \`device_type\` enum ('web', 'mobile_ios', 'mobile_android', 'desktop', 'other') NOT NULL DEFAULT 'web', \`refresh_token_id\` bigint NULL, \`attempted_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_user_time\` (\`user_id\`, \`attempted_at\`), INDEX \`idx_ip_time\` (\`ip_address\`, \`attempted_at\`), INDEX \`idx_email_time\` (\`email\`, \`attempted_at\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`CREATE TABLE \`password_reset_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`user_id\` int NOT NULL, \`token_hash\` char(64) NOT NULL, \`expires_at\` datetime(6) NOT NULL, \`used_at\` datetime(6) NULL, \`requested_ip\` varchar(45) NULL, \`created_at\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), INDEX \`idx_prt_user\` (\`user_id\`), UNIQUE INDEX \`idx_prt_hash\` (\`token_hash\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`);
        await queryRunner.query(`ALTER TABLE \`user_roles\` ADD CONSTRAINT \`FK_87b8888186ca9769c960e926870\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_roles\` ADD CONSTRAINT \`FK_b23c65e50a758245a33ee35fda1\` FOREIGN KEY (\`role_id\`) REFERENCES \`roles\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`user_roles\` ADD CONSTRAINT \`FK_6de6fefffe4a6d17de747bf8b9d\` FOREIGN KEY (\`assigned_by\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`users\` ADD CONSTRAINT \`FK_25e1cf8f41bae2f3d11f3c2a028\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`audit_logs\` ADD CONSTRAINT \`FK_f160d97a931844109de9d04228f\` FOREIGN KEY (\`actor_user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`audit_logs\` ADD CONSTRAINT \`FK_dfa425a9b20aa546ef0280a8769\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_3ddc983c5f7bcf132fd8732c3f4\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_5a8e126b7a91b145aa651af5507\` FOREIGN KEY (\`parent_id\`) REFERENCES \`refresh_tokens\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_860225ddfe4588a6d26e31b0c21\` FOREIGN KEY (\`replaced_by_id\`) REFERENCES \`refresh_tokens\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` ADD CONSTRAINT \`FK_5f88175f39e2b2ebf9e2295a9fd\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` ADD CONSTRAINT \`FK_d3890b9e58a3ad392689f6b3385\` FOREIGN KEY (\`school_id\`) REFERENCES \`schools\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` ADD CONSTRAINT \`FK_3a65a258bf7390212c2b5322aca\` FOREIGN KEY (\`refresh_token_id\`) REFERENCES \`refresh_tokens\`(\`id\`) ON DELETE SET NULL ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE \`password_reset_tokens\` ADD CONSTRAINT \`FK_52ac39dd8a28730c63aeb428c9c\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE \`password_reset_tokens\` DROP FOREIGN KEY \`FK_52ac39dd8a28730c63aeb428c9c\``);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` DROP FOREIGN KEY \`FK_3a65a258bf7390212c2b5322aca\``);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` DROP FOREIGN KEY \`FK_d3890b9e58a3ad392689f6b3385\``);
        await queryRunner.query(`ALTER TABLE \`login_attempts\` DROP FOREIGN KEY \`FK_5f88175f39e2b2ebf9e2295a9fd\``);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_860225ddfe4588a6d26e31b0c21\``);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_5a8e126b7a91b145aa651af5507\``);
        await queryRunner.query(`ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_3ddc983c5f7bcf132fd8732c3f4\``);
        await queryRunner.query(`ALTER TABLE \`audit_logs\` DROP FOREIGN KEY \`FK_dfa425a9b20aa546ef0280a8769\``);
        await queryRunner.query(`ALTER TABLE \`audit_logs\` DROP FOREIGN KEY \`FK_f160d97a931844109de9d04228f\``);
        await queryRunner.query(`ALTER TABLE \`users\` DROP FOREIGN KEY \`FK_25e1cf8f41bae2f3d11f3c2a028\``);
        await queryRunner.query(`ALTER TABLE \`user_roles\` DROP FOREIGN KEY \`FK_6de6fefffe4a6d17de747bf8b9d\``);
        await queryRunner.query(`ALTER TABLE \`user_roles\` DROP FOREIGN KEY \`FK_b23c65e50a758245a33ee35fda1\``);
        await queryRunner.query(`ALTER TABLE \`user_roles\` DROP FOREIGN KEY \`FK_87b8888186ca9769c960e926870\``);
        await queryRunner.query(`DROP INDEX \`idx_prt_hash\` ON \`password_reset_tokens\``);
        await queryRunner.query(`DROP INDEX \`idx_prt_user\` ON \`password_reset_tokens\``);
        await queryRunner.query(`DROP TABLE \`password_reset_tokens\``);
        await queryRunner.query(`DROP INDEX \`idx_email_time\` ON \`login_attempts\``);
        await queryRunner.query(`DROP INDEX \`idx_ip_time\` ON \`login_attempts\``);
        await queryRunner.query(`DROP INDEX \`idx_user_time\` ON \`login_attempts\``);
        await queryRunner.query(`DROP TABLE \`login_attempts\``);
        await queryRunner.query(`DROP INDEX \`idx_user_active\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`idx_family\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`idx_cleanup\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`IDX_a7838d2ba25be1342091b6695f\` ON \`refresh_tokens\``);
        await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
        await queryRunner.query(`DROP INDEX \`idx_actor\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`idx_entity\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`idx_action\` ON \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`idx_school_time\` ON \`audit_logs\``);
        await queryRunner.query(`DROP TABLE \`audit_logs\``);
        await queryRunner.query(`DROP INDEX \`idx_user_email_school\` ON \`users\``);
        await queryRunner.query(`DROP INDEX \`idx_user_school_status\` ON \`users\``);
        await queryRunner.query(`DROP TABLE \`users\``);
        await queryRunner.query(`DROP INDEX \`IDX_b23c65e50a758245a33ee35fda\` ON \`user_roles\``);
        await queryRunner.query(`DROP TABLE \`user_roles\``);
        await queryRunner.query(`DROP INDEX \`IDX_881f72bac969d9a00a1a29e107\` ON \`roles\``);
        await queryRunner.query(`DROP TABLE \`roles\``);
        await queryRunner.query(`DROP TABLE \`schools\``);
    }

}
