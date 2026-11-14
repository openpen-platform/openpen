import { describe, it, expect } from 'vitest';
import { DEFAULT_SETTINGS } from '../../shared/settings-defaults.js';
import { settingsPatchSchema, communityInstallPayloadSchema } from '../../electron/ipc-payload-schemas.js';

describe('showCommunityPlugins setting', () => {
  it('is off by default', () => {
    expect(DEFAULT_SETTINGS.showCommunityPlugins).toBe(false);
  });

  it('accepts a boolean in a settings patch', () => {
    const out = settingsPatchSchema.parse({ showCommunityPlugins: true });
    expect(out.patch).toEqual({ showCommunityPlugins: true });
    expect(out.droppedKeys).toEqual([]);
  });

  it('drops a non-boolean value instead of storing it', () => {
    const out = settingsPatchSchema.parse({ showCommunityPlugins: 'yes' });
    expect(out.patch).toEqual({});
    expect(out.droppedKeys).toEqual(['showCommunityPlugins']);
  });
});

describe('communityInstallPayloadSchema', () => {
  it('requires the unreviewed notice to be acknowledged', () => {
    expect(communityInstallPayloadSchema.safeParse({ id: '@alice/ruler' }).success).toBe(false);
    expect(communityInstallPayloadSchema.safeParse({ id: '@alice/ruler', acknowledgedUnreviewed: false }).success).toBe(false);
    expect(communityInstallPayloadSchema.safeParse({ id: '@alice/ruler', acknowledgedUnreviewed: true }).success).toBe(true);
  });
});
