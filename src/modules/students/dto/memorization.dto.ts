import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

/** A verse range (Quran order). Cross-surah ranges are allowed. */
export class MemorizationRangeDto {
  @ApiProperty({ example: 1, minimum: 1, maximum: 114 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  start_surah!: number;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  start_verse!: number;

  @ApiProperty({
    example: 2,
    minimum: 1,
    maximum: 114,
    description: 'Must be >= start_surah.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(114)
  end_surah!: number;

  @ApiProperty({ example: 5, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  end_verse!: number;
}

/**
 * Manual edit of a student's memorized-ayat bitmap. `set` marks ranges as
 * memorized, `clear` unmarks them; both are applied onto the current bitmap
 * (set first, then clear). At least one non-empty array is required.
 *
 * Note: a later recompute (any Hifz achievement approve/unapprove/delete)
 * rebuilds the bitmap from approved achievements and overwrites manual edits.
 */
export class EditMemorizationDto {
  @ApiProperty({
    required: false,
    type: [MemorizationRangeDto],
    description: 'Ranges to mark memorized.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MemorizationRangeDto)
  set?: MemorizationRangeDto[];

  @ApiProperty({
    required: false,
    type: [MemorizationRangeDto],
    description: 'Ranges to unmark.',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MemorizationRangeDto)
  clear?: MemorizationRangeDto[];
}

export class MemorizationResponse {
  @ApiProperty({
    example: 240,
    description: 'Number of memorized ayat (set bits).',
  })
  memorized_ayah_count!: number;

  @ApiProperty({
    example: 'AAAA…',
    description:
      'Base64 of the 780-byte bitmap. Bit i (MSB-first per byte) = the i-th ayah in mushaf order, ' +
      'starting at Al-Fatihah:1 (index 0).',
  })
  bitmap_base64!: string;
}

export class MemorizationEnvelope {
  @ApiProperty({ example: 200 })
  code!: number;

  @ApiProperty({ type: MemorizationResponse })
  data!: MemorizationResponse;
}
