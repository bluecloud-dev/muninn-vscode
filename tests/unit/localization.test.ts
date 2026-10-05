import { escapeHtml, formatString, getHtmlString } from '../../src/webview/editor/localization';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

describe('webview localization', () => {
  it('escapes localized strings before HTML interpolation', () => {
    expect(escapeHtml(`"<img src=x onerror='alert(1)'>&`)).to.equal(
      '&quot;&lt;img src=x onerror=&#039;alert(1)&#039;&gt;&amp;',
    );
  });

  it('returns escaped defaults for bootstrap HTML strings', () => {
    expect(getHtmlString('statusReady')).to.equal('Ready');
  });

  it('formats localized message templates', () => {
    expect(formatString('Run {0} in {1}', 'Source', 'Muninn')).to.equal('Run Source in Muninn');
  });

  it('inserts dollar sequences as literal localized values', () => {
    const value = "$& $$ $` $' $1 $<name>";
    expect(formatString('Before {0}, again {0}, after', value)).to.equal(
      `Before ${value}, again ${value}, after`,
    );
  });
});
