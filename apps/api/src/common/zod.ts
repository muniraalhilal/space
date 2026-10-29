import { PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, z } from 'zod';
import { Errors } from './errors';

/** Validates a body/query against a shared zod schema. Unknown keys are stripped. */
export class ZodPipe<T extends ZodTypeAny> implements PipeTransform<unknown, z.infer<T>> {
  constructor(private readonly schema: T) {}
  transform(value: unknown): z.infer<T> {
    const r = this.schema.safeParse(value ?? {});
    if (!r.success) throw Errors.validation(r.error.flatten());
    return r.data;
  }
}

export const zp = <T extends ZodTypeAny>(s: T) => new ZodPipe(s);

/** UUID path param validator — returns 404 rather than leaking a DB error. */
export class UuidPipe implements PipeTransform<string, string> {
  transform(v: string) {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) throw Errors.notFound();
    return v;
  }
}
