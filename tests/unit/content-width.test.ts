import {
  applyContentWidth,
  resolveContentWidthCssValue,
} from '../../src/webview/editor/content-width';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

class FakeStyle {
  public readonly properties = new Map<string, string>();

  public setProperty(name: string, value: string): void {
    this.properties.set(name, value);
  }
}

describe('content width helpers', () => {
  it('maps comfortable, full, and numeric settings to CSS max-width values', () => {
    expect(resolveContentWidthCssValue('comfortable')).to.equal('70ch');
    expect(resolveContentWidthCssValue('full')).to.equal('none');
    expect(resolveContentWidthCssValue(88)).to.equal('88ch');
  });

  it('applies the content width as a CSS custom property', () => {
    const element = { style: new FakeStyle() };

    applyContentWidth(element as unknown as HTMLElement, 64);

    expect(element.style.properties.get('--muninn-content-width')).to.equal('64ch');
  });
});
