// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { screenLockSkipReason } from '../e2e/screen-lock.js';

// Shape of `ioreg -n Root -d1 -a` output around the session key.
const ioreg = (locked) => `<dict>
\t<key>IOConsoleUsers</key>
\t<array><dict>
\t\t${locked === undefined ? '' : `<key>CGSSessionScreenIsLocked</key>\n\t\t\t<${locked}/>`}
\t\t<key>kCGSSessionOnConsoleKey</key>
\t\t<true/>
\t</dict></array>
</dict>`;

describe('e2e screen-lock precondition', () => {
  it('gives a skip reason naming the detection when macOS reports the screen locked', () => {
    const reason = screenLockSkipReason('darwin', ioreg('true'));
    expect(reason).toMatch(/locked/);
    expect(reason).toContain('CGSSessionScreenIsLocked');
  });

  it('does not skip when unlocked, when the key is absent, when ioreg failed, or off macOS', () => {
    expect(screenLockSkipReason('darwin', ioreg('false'))).toBeNull();
    expect(screenLockSkipReason('darwin', ioreg(undefined))).toBeNull();
    expect(screenLockSkipReason('darwin', null)).toBeNull();
    expect(screenLockSkipReason('linux', ioreg('true'))).toBeNull();
  });
});
