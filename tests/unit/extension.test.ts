import sinon from 'sinon';
import * as vscode from 'vscode';
import { activate } from '../../src/extension';
import { MuninnCustomEditorProvider } from '../../src/custom-editor/muninn-custom-editor-provider';
let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

const createOutputChannel = (): vscode.LogOutputChannel => ({
  name: 'Muninn for VS Code',
  logLevel: 0 as unknown as vscode.LogLevel,
  onDidChangeLogLevel: sinon.stub() as unknown as vscode.Event<vscode.LogLevel>,
  trace: () => {},
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  append: () => {},
  appendLine: () => {},
  replace: () => {},
  clear: () => {},
  show: ((...arguments_: unknown[]) => {
    void arguments_;
  }) as unknown as vscode.LogOutputChannel['show'],
  hide: () => {},
  dispose: () => {},
});

const createMemento = (): vscode.Memento => {
  const store = new Map<string, unknown>();
  return {
    get: <T>(key: string, defaultValue?: T): T => {
      if (store.has(key)) {
        return store.get(key) as T;
      }
      return defaultValue as T;
    },
    update: async (key: string, value: unknown): Promise<void> => {
      store.set(key, value);
    },
    keys: () => [...store.keys()],
  } as vscode.Memento;
};

describe('extension activation', () => {
  afterEach(() => {
    sinon.restore();
    vscode.window.activeTextEditor = undefined as unknown as vscode.TextEditor;
  });

  it('registers commands and updates configuration inspection output', async () => {
    const registerCommandStub = sinon.stub(vscode.commands, 'registerCommand');
    const registerCustomEditorProviderStub = sinon.stub(
      vscode.window,
      'registerCustomEditorProvider',
    );
    const executeCommandStub = sinon.stub(vscode.commands, 'executeCommand').resolves();
    sinon.stub(vscode.workspace, 'onDidChangeConfiguration').returns({ dispose: () => {} });

    const outputChannel = createOutputChannel();
    const appendLine = sinon.stub(outputChannel, 'appendLine');
    sinon.stub(vscode.window, 'createOutputChannel').returns(outputChannel);

    sinon.stub(vscode.workspace, 'getConfiguration').returns({
      get: (_key: string, defaultValue: unknown) => defaultValue,
      has: () => true,
      inspect: () => ({ defaultValue: true, globalValue: true }),
      update: sinon.stub(),
    } as unknown as vscode.WorkspaceConfiguration);

    const context = {
      subscriptions: [],
      globalState: createMemento(),
      workspaceState: createMemento(),
      extension: { id: 'bluecloud-dev.muninn-vscode' },
    } as unknown as vscode.ExtensionContext;

    activate(context);

    const registeredCommands = registerCommandStub.getCalls().map((call) => call.args[0]);
    expect(registeredCommands).to.include('muninn.inspectConfiguration');
    expect(registeredCommands).to.include('muninn.reportIssue');
    expect(registeredCommands).to.include('muninn.tableActions');
    expect(registerCustomEditorProviderStub.calledOnce).to.equal(true);

    const inspectCommand = registerCommandStub
      .getCalls()
      .find((call) => call.args[0] === 'muninn.inspectConfiguration');
    const inspectCallback = inspectCommand?.args[1] as () => void;

    inspectCallback();

    expect(appendLine.called).to.equal(true);

    const reportIssueCommand = registerCommandStub
      .getCalls()
      .find((call) => call.args[0] === 'muninn.reportIssue');
    const reportIssueCallback = reportIssueCommand?.args[1] as () => Promise<void>;
    await reportIssueCallback();
    expect(
      executeCommandStub.calledWithExactly('workbench.action.openIssueReporter', {
        extensionId: 'bluecloud-dev.muninn-vscode',
      }),
    ).to.equal(true);
  });

  it('notifies open editors when muninn settings change', () => {
    sinon.stub(vscode.window, 'createOutputChannel').returns(createOutputChannel());
    sinon.stub(vscode.window, 'registerCustomEditorProvider').returns({ dispose: () => {} });
    sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: () => {} });
    const notify = sinon
      .stub(MuninnCustomEditorProvider.prototype, 'notifyConfigurationChanged')
      .resolves();

    let configChangeListener: ((event: vscode.ConfigurationChangeEvent) => void) | undefined;
    sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake((listener) => {
      configChangeListener = listener;
      return { dispose: () => {} };
    });

    const context = {
      subscriptions: [],
      globalState: createMemento(),
      workspaceState: createMemento(),
    } as unknown as vscode.ExtensionContext;

    activate(context);
    expect(configChangeListener).to.not.equal(undefined);

    configChangeListener?.({
      affectsConfiguration: (section: string) => section === 'muninn',
    } as vscode.ConfigurationChangeEvent);

    expect(notify.calledOnce).to.equal(true);
  });

  it('ignores configuration changes outside muninn scope', () => {
    sinon.stub(vscode.window, 'createOutputChannel').returns(createOutputChannel());
    sinon.stub(vscode.window, 'registerCustomEditorProvider').returns({ dispose: () => {} });
    sinon.stub(vscode.commands, 'registerCommand').returns({ dispose: () => {} });
    sinon.stub(vscode.commands, 'executeCommand').resolves();
    const notify = sinon
      .stub(MuninnCustomEditorProvider.prototype, 'notifyConfigurationChanged')
      .resolves();

    let configChangeListener: ((event: vscode.ConfigurationChangeEvent) => void) | undefined;
    sinon.stub(vscode.workspace, 'onDidChangeConfiguration').callsFake((listener) => {
      configChangeListener = listener;
      return { dispose: () => {} };
    });

    const context = {
      subscriptions: [],
      globalState: createMemento(),
      workspaceState: createMemento(),
    } as unknown as vscode.ExtensionContext;

    activate(context);

    configChangeListener?.({
      affectsConfiguration: (section: string) => section === 'otherSection',
    } as vscode.ConfigurationChangeEvent);

    expect(notify.called).to.equal(false);
  });
});
