import { createAnnouncer, formatErrorAnnouncement } from '../../src/webview/editor/announcements';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('webview announcements', () => {
  it('routes statuses to the polite line and clears alerts', () => {
    const statusLine = { hidden: false, textContent: '' } as HTMLElement;
    const alertLine = { hidden: false, textContent: '' } as HTMLElement;
    alertLine.textContent = 'Error: Previous failure.';

    const announce = createAnnouncer({ statusLine, alertLine });

    announce('Inserted table.', { kind: 'status' });

    expect(statusLine.textContent).to.equal('Inserted table.');
    expect(statusLine.hidden).to.equal(false);
    expect(alertLine.textContent).to.equal('');
    expect(alertLine.hidden).to.equal(true);
  });

  it('routes errors to the assertive line and clears statuses', () => {
    const statusLine = { hidden: false, textContent: '' } as HTMLElement;
    const alertLine = { hidden: false, textContent: '' } as HTMLElement;
    statusLine.textContent = 'Ready';

    const announce = createAnnouncer({ statusLine, alertLine });

    announce('Could not run Link.', { kind: 'error' });

    expect(statusLine.textContent).to.equal('');
    expect(statusLine.hidden).to.equal(true);
    expect(alertLine.textContent).to.equal('Error: Could not run Link.');
    expect(alertLine.hidden).to.equal(false);
  });

  it('uses one localized error wrapper for failures', () => {
    expect(formatErrorAnnouncement('Failed to insert link.')).to.equal(
      'Error: Failed to insert link.',
    );
  });
});
