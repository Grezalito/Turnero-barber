import { IsBoolean, IsObject, IsOptional } from 'class-validator';

export class ToggleReminderDto {
  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsObject()
  @IsOptional()
  reminder_config?: Record<string, unknown>;
}
