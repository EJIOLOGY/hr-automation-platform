import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../../core/prisma/prisma.service';
import { HrOfficerStatus } from '../../../generated/prisma/enums';

interface JwtPayload {
  sub: string;
  email: string;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    const secret = configService.get<string>('JWT_ACCESS_SECRET');

    if (!secret) {
      throw new Error('JWT_ACCESS_SECRET is not configured.');
    }

    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: secret,
    });
  }

  async validate(payload: JwtPayload) {
    const officer = await this.prisma.hrOfficer.findUnique({
      where: {
        id: payload.sub,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
      },
    });

    if (!officer || officer.status !== HrOfficerStatus.ACTIVE) {
      throw new UnauthorizedException('HR account is inactive or unavailable.');
    }

    return {
      id: officer.id,
      email: officer.email,
      fullName: officer.fullName,
      role: officer.role,
    };
  }
}
