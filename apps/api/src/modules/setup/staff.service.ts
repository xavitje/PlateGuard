import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { StaffCandidate, StaffInput, StaffLink, StaffMember } from '@plateguard/contracts';
import { can, type Principal } from '@plateguard/domain';
import type { TenantContext } from '../auth/permissions.js';
import { StaffRepository } from './staff.repository.js';

type Location = { id: string; organizationId: string };

/**
 * The people who work at a location: their roles here and their PIN. Owners need
 * staff.manage.owners; nobody changes their own roles or removes themselves.
 */
@Injectable()
export class StaffService {
  constructor(private readonly repo: StaffRepository) {}

  list(ctx: TenantContext, location: Location): Promise<StaffMember[]> {
    return this.repo.list(ctx, location);
  }

  async create(ctx: TenantContext, user: Principal, location: Location, input: StaffInput) {
    this.mayGrant(user, location, input.roles);
    if (input.pin && (await this.repo.pinTaken(ctx, location, input.name, input.pin)))
      throw new ConflictException({ code: 'PIN_TAKEN' });
    await this.repo.create(ctx, location, input);
    return this.list(ctx, location);
  }

  async update(
    ctx: TenantContext,
    user: Principal,
    location: Location,
    id: string,
    input: Omit<StaffInput, 'pin'>,
  ) {
    const member = await this.member(ctx, location, id);
    if (id === user.userId) throw new ForbiddenException({ code: 'STAFF_SELF' });
    this.mayGrant(user, location, [...input.roles, ...member.roles]);
    await this.repo.update(ctx, location, id, input);
    return this.list(ctx, location);
  }

  candidates(ctx: TenantContext, location: Location): Promise<StaffCandidate[]> {
    return this.repo.candidates(ctx, location);
  }

  /** Someone who works at another location of the restaurant starts here too: one person, one history. */
  async link(
    ctx: TenantContext,
    user: Principal,
    location: Location,
    id: string,
    input: StaffLink,
  ) {
    const person = (await this.repo.candidates(ctx, location)).find((c) => c.id === id);
    if (!person) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
    this.mayGrant(user, location, input.roles);
    if (await this.repo.pinTaken(ctx, location, person.name, input.pin))
      throw new ConflictException({ code: 'PIN_TAKEN' });
    await this.repo.link(ctx, location, id, input);
    return this.list(ctx, location);
  }

  /** A new PIN also unlocks a PIN that was locked by wrong tries. */
  async setPin(ctx: TenantContext, user: Principal, location: Location, id: string, pin: string) {
    const member = await this.member(ctx, location, id);
    if (id !== user.userId) this.mayGrant(user, location, [...member.roles, ...member.orgRoles]);
    if (await this.repo.pinTaken(ctx, location, member.name, pin, id))
      throw new ConflictException({ code: 'PIN_TAKEN' });
    await this.repo.setPin(ctx, location, id, pin);
    return this.list(ctx, location);
  }

  /** Takes someone off this location: their roles here and their PIN. The account stays. */
  async remove(ctx: TenantContext, user: Principal, location: Location, id: string) {
    const member = await this.member(ctx, location, id);
    if (id === user.userId) throw new ForbiddenException({ code: 'STAFF_SELF' });
    if (member.orgRoles.length > 0) throw new BadRequestException({ code: 'STAFF_ORG_ROLE' });
    this.mayGrant(user, location, member.roles);
    await this.repo.remove(ctx, location, id);
    return this.list(ctx, location);
  }

  private mayGrant(user: Principal, location: Location, roles: string[]) {
    if (roles.includes('OWNER') && !can(user, 'staff.manage.owners', location))
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        details: { permission: 'staff.manage.owners' },
      });
  }

  private async member(ctx: TenantContext, location: Location, id: string) {
    const member = (await this.list(ctx, location)).find((m) => m.id === id);
    if (!member) throw new NotFoundException({ code: 'STAFF_NOT_FOUND' });
    return member;
  }
}
