import {
  IsEmail,
  IsString,
  IsOptional,
  IsEnum,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UserRole } from '@app/shared';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address - must be unique within the tenant',
    example: 'john.doe@company.com',
    format: 'email',
  })
  @IsEmail()
  email!: string;

  @ApiProperty({
    description: 'User password - minimum 8 characters, will be hashed before storage',
    example: 'SecurePassword123!',
    minLength: 8,
    format: 'password',
  })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  firstName!: string;

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: 1,
    maxLength: 100,
  })
  @IsString()
  lastName!: string;

  @ApiPropertyOptional({
    description: 'User role within the tenant - defaults to member if not specified',
    enum: UserRole,
    enumName: 'UserRole',
    example: UserRole.MEMBER,
    default: UserRole.MEMBER,
  })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({
    description: 'User phone number in international format',
    example: '+1-555-123-4567',
    maxLength: 20,
  })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({
    description: 'User job title or position',
    example: 'Software Engineer',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  jobTitle?: string;

  @ApiPropertyOptional({
    description: 'User department or team',
    example: 'Engineering',
    maxLength: 100,
  })
  @IsOptional()
  @IsString()
  department?: string;
}
