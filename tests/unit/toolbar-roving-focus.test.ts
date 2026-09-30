import { attachToolbarRovingFocus } from '../../src/webview/editor/toolbar-roving-focus';

let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

type RecordedKeyboardEvent = {
  defaultPrevented: boolean;
  key: string;
  preventDefault: () => void;
  target: FakeButton;
};

class FakeButton {
  public hidden = false;
  public tabIndex = -1;
  public readonly focusedKeys: string[] = [];

  public constructor(public readonly command: string) {}

  public focus(): void {
    this.focusedKeys.push(this.command);
  }
}

class FakeToolbar {
  private readonly listeners = new Map<string, EventListener[]>();

  public constructor(private readonly buttons: FakeButton[]) {}

  public addEventListener(type: string, listener: EventListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  public contains(target: EventTarget | null): boolean {
    return this.buttons.includes(target as unknown as FakeButton);
  }

  public querySelectorAll(selector: string): NodeListOf<HTMLButtonElement> {
    expect(selector).to.equal('button');
    return this.buttons as unknown as NodeListOf<HTMLButtonElement>;
  }

  public dispatchFocusIn(target: FakeButton): void {
    for (const listener of this.listeners.get('focusin') ?? []) {
      listener({ target } as unknown as FocusEvent);
    }
  }

  public dispatchKeydown(target: FakeButton, key: string): RecordedKeyboardEvent {
    const event: RecordedKeyboardEvent = {
      defaultPrevented: false,
      key,
      preventDefault(): void {
        event.defaultPrevented = true;
      },
      target,
    };

    for (const listener of this.listeners.get('keydown') ?? []) {
      listener(event as unknown as KeyboardEvent);
    }

    return event;
  }
}

describe('toolbar roving focus', () => {
  it('wraps arrow-key focus across visible toolbar buttons', () => {
    const bold = new FakeButton('toggleBold');
    const italic = new FakeButton('toggleItalic');
    const source = new FakeButton('openRawMarkdown');
    const toolbar = new FakeToolbar([bold, italic, source]);

    attachToolbarRovingFocus(toolbar as unknown as HTMLElement);

    expect(bold.tabIndex).to.equal(0);
    expect(italic.tabIndex).to.equal(-1);
    expect(source.tabIndex).to.equal(-1);

    const leftEvent = toolbar.dispatchKeydown(bold, 'ArrowLeft');
    expect(leftEvent.defaultPrevented).to.equal(true);
    expect(source.focusedKeys).to.deep.equal(['openRawMarkdown']);
    expect(source.tabIndex).to.equal(0);
    expect(bold.tabIndex).to.equal(-1);

    const rightEvent = toolbar.dispatchKeydown(source, 'ArrowRight');
    expect(rightEvent.defaultPrevented).to.equal(true);
    expect(bold.focusedKeys).to.deep.equal(['toggleBold']);
    expect(bold.tabIndex).to.equal(0);
    expect(source.tabIndex).to.equal(-1);
  });

  it('skips hidden toolbar buttons for arrow and boundary keys', () => {
    const bold = new FakeButton('toggleBold');
    const hiddenHeading = new FakeButton('setHeading3');
    const paragraph = new FakeButton('setParagraph');
    const more = new FakeButton('more');
    hiddenHeading.hidden = true;
    const toolbar = new FakeToolbar([bold, hiddenHeading, paragraph, more]);

    attachToolbarRovingFocus(toolbar as unknown as HTMLElement);

    toolbar.dispatchKeydown(bold, 'ArrowRight');
    expect(paragraph.focusedKeys).to.deep.equal(['setParagraph']);
    expect(paragraph.tabIndex).to.equal(0);
    expect(hiddenHeading.tabIndex).to.equal(-1);

    toolbar.dispatchKeydown(paragraph, 'End');
    expect(more.focusedKeys).to.deep.equal(['more']);
    expect(more.tabIndex).to.equal(0);

    toolbar.dispatchKeydown(more, 'Home');
    expect(bold.focusedKeys).to.deep.equal(['toggleBold']);
    expect(bold.tabIndex).to.equal(0);
  });

  it('revalidates a hidden roving stop to the preferred visible fallback', () => {
    const bold = new FakeButton('toggleBold');
    const hiddenHeading = new FakeButton('setHeading3');
    const more = new FakeButton('more');
    const toolbar = new FakeToolbar([bold, hiddenHeading, more]);
    const rovingFocus = attachToolbarRovingFocus(toolbar as unknown as HTMLElement);

    toolbar.dispatchFocusIn(hiddenHeading);
    expect(hiddenHeading.tabIndex).to.equal(0);
    expect(bold.tabIndex).to.equal(-1);

    hiddenHeading.hidden = true;
    rovingFocus.revalidateCurrentStop(more as unknown as HTMLButtonElement);
    expect(more.tabIndex).to.equal(0);
    expect(hiddenHeading.tabIndex).to.equal(-1);

    more.hidden = true;
    rovingFocus.revalidateCurrentStop(more as unknown as HTMLButtonElement);
    expect(bold.tabIndex).to.equal(0);
    expect(more.tabIndex).to.equal(-1);
  });
});
