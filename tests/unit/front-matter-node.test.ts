import { DEFAULT_WEBVIEW_STRINGS } from '../../src/shared/webview-strings';
import {
  parseHostMarkdown,
  schema,
  serializeToHostMarkdown,
} from '../../src/webview/editor/markdown-codec';
import {
  FrontMatterNodeView,
  getFrontMatterDisplayText,
} from '../../src/webview/editor/nodes/front-matter-node-view';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

type GlobalWithDocument = typeof globalThis & {
  document?: Document;
};

class MinimalElement {
  readonly tagName: string;
  className = '';
  contentEditable = '';
  textContent = '';
  private readonly attributes = new Map<string, string>();
  private readonly children: MinimalElement[] = [];

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  append(...children: MinimalElement[]): void {
    this.children.push(...children);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  getAttribute(name: string): string | undefined {
    return this.attributes.get(name);
  }

  querySelector(selector: string): MinimalElement | undefined {
    const expectedTag = selector.toUpperCase();
    return this.children.find((child) => child.tagName === expectedTag);
  }
}

const installMinimalDocument = (): (() => void) => {
  const globalContext = globalThis as GlobalWithDocument;
  const previousDocument = globalContext.document;
  globalContext.document = {
    createElement: (tagName: string) => new MinimalElement(tagName),
  } as unknown as Document;
  return () => {
    globalContext.document = previousDocument;
  };
};

describe('front matter codec and rendering helpers', () => {
  it('round-trips YAML front matter byte-for-byte including the final newline', () => {
    const markdown = [
      '---',
      'title: Muninn',
      'tags: [notes, markdown]',
      '---',
      '',
      '# Document body',
      '',
    ].join('\n');

    expect(serializeToHostMarkdown(parseHostMarkdown(markdown))).to.equal(markdown);
  });

  it('keeps mid-document thematic breaks as markdown, not front matter', () => {
    const markdown = ['# Before', '', '---', '', '# After', ''].join('\n');

    expect(serializeToHostMarkdown(parseHostMarkdown(markdown))).to.equal(markdown);
  });

  it('renders a localized label and displays only the YAML body text', () => {
    const raw = '---\ntitle: Muninn\nnested:\n  - markdown\n---\n';

    expect(DEFAULT_WEBVIEW_STRINGS.frontMatterLabel).to.equal('Front matter');
    expect(DEFAULT_WEBVIEW_STRINGS.frontMatterAriaLabel).to.equal('Front matter metadata block');
    expect(getFrontMatterDisplayText(raw)).to.equal('title: Muninn\nnested:\n  - markdown');
  });

  it('strips empty front matter delimiters for display', () => {
    expect(getFrontMatterDisplayText('---\n---\n')).to.equal('');
    expect(getFrontMatterDisplayText('---\r\n---\r\n')).to.equal('');
  });

  it('instantiates the NodeView DOM with localized accessibility text and YAML body', () => {
    const restoreDocument = installMinimalDocument();
    try {
      const raw = '---\ntitle: Muninn\nnested:\n  - markdown\n---\n';
      const node = schema.nodes.front_matter.create({ raw });
      const nodeView = new FrontMatterNodeView(node);

      expect(nodeView.dom.tagName).to.equal('SECTION');
      expect(nodeView.dom.getAttribute('aria-label')).to.equal(
        DEFAULT_WEBVIEW_STRINGS.frontMatterAriaLabel,
      );
      expect(nodeView.dom.querySelector('pre')?.textContent).to.equal(
        getFrontMatterDisplayText(raw),
      );
    } finally {
      restoreDocument();
    }
  });
});
