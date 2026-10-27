import { IsOptional, IsString, Matches } from 'class-validator';

export class ManageBarberSlotsDto {
  /**
   * Fecha base opcional en formato YYYY-MM-DD cuando start_time/end_time o slot_start_time
   * se envían como hora "HH:mm" (ej: "09:00" a "13:00").
   */
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'date debe tener formato YYYY-MM-DD',
  })
  date?: string;

  /**
   * Fecha fin opcional en formato YYYY-MM-DD para apertura de jornada en rango de días.
   */
  @IsString()
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'end_date debe tener formato YYYY-MM-DD',
  })
  end_date?: string;

  /**
   * Inicio del rango horario (ISO 8601 o "HH:mm" combinado con `date`).
   * Ej: de 10:00 a 20:00 genera bloques exactos de 30 minutos.
   */
  @IsString()
  @IsOptional()
  start_time?: string;

  /**
   * Fin del rango horario (ISO 8601 o "HH:mm" combinado con `date`).
   */
  @IsString()
  @IsOptional()
  end_time?: string;

  /**
   * Inicio opcional del corte de descanso (formato "HH:mm", ej: "14:00").
   */
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:(00|30)$/, {
    message: 'break_start_time debe tener formato HH:00 o HH:30',
  })
  break_start_time?: string;

  /**
   * Fin opcional del corte de descanso (formato "HH:mm", ej: "16:00").
   */
  @IsString()
  @IsOptional()
  @Matches(/^\d{2}:(00|30)$/, {
    message: 'break_end_time debe tener formato HH:00 o HH:30',
  })
  break_end_time?: string;

  /**
   * Horario puntual de 30 minutos para alternar (activar si no existe / borrar si está AVAILABLE).
   * Puede ser ISO 8601 o "HH:mm" combinado con `date`.
   */
  @IsString()
  @IsOptional()
  slot_start_time?: string;
}
