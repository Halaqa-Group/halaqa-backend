import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { Halaqa } from './halaqa.entity';

export type PrayerSlot = 'fajr' | 'dhuhr' | 'asr' | 'maghrib' | 'isha';

@Entity('halaqa_schedules')
@Index('idx_halaqa_day', ['halaqaId', 'dayOfWeek'], { unique: true })
export class HalaqaSchedule {
  @PrimaryGeneratedColumn({ type: 'int' })
  id!: number;

  @Column({ name: 'halaqa_id', type: 'int' })
  halaqaId!: number;

  // 0 = Saturday … 6 = Friday (Arab calendar order)
  @Column({ name: 'day_of_week', type: 'tinyint' })
  dayOfWeek!: number;

  @Column({
    name: 'prayer_slot',
    type: 'enum',
    enum: ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'],
    nullable: true,
  })
  prayerSlot!: PrayerSlot | null;

  // TIME columns are returned as 'HH:MM:SS' strings by the MySQL driver.
  @Column({ name: 'start_time', type: 'time', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'time', nullable: true })
  endTime!: string | null;

  @ManyToOne(() => Halaqa, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'halaqa_id' })
  halaqa!: Halaqa;
}
