import assert from 'node:assert/strict';
import sinon from 'sinon';
import * as vscode from 'vscode';
import { ConfigService } from '../../src/services/config-service';
let expect: Chai.ExpectStatic;

before(async () => {
  ({ expect } = await import('chai'));
});

type ConfigurationOverrides = {
  mermaidEnabled?: boolean;
  mermaidAllowInUntrustedWorkspaces?: boolean;
  toolbarMode?: 'basic' | 'advanced';
  imageDestination?: string;
  contentWidth?: 'comfortable' | 'full' | number;
};

const createConfiguration = (overrides?: ConfigurationOverrides): vscode.WorkspaceConfiguration => {
  const values = {
    'integrations.mermaid.enabled': overrides?.mermaidEnabled,
    'integrations.mermaid.allowInUntrustedWorkspaces': overrides?.mermaidAllowInUntrustedWorkspaces,
    'toolbar.mode': overrides?.toolbarMode,
    'images.destination': overrides?.imageDestination,
    'appearance.contentWidth': overrides?.contentWidth,
  };

  return {
    get: (key: string, defaultValue: unknown) => {
      if (key in values && values[key as keyof typeof values] !== undefined) {
        return values[key as keyof typeof values];
      }
      return defaultValue;
    },
    inspect: (key: string) => ({
      defaultValue: values[key as keyof typeof values],
      globalValue: values[key as keyof typeof values],
    }),
  } as vscode.WorkspaceConfiguration;
};

describe('ConfigService', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('accepts untrusted diagram permission only from explicit user settings', () => {
    const configuration = createConfiguration({ mermaidAllowInUntrustedWorkspaces: true });
    sinon.stub(configuration, 'inspect').returns({ key: 'permission', workspaceValue: true });
    sinon.stub(vscode.workspace, 'getConfiguration').returns(configuration);
    assert.equal(new ConfigService().getMermaidAllowInUntrustedWorkspaces(), false);
  });

  it('returns defaults when configuration is empty', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(createConfiguration());

    const service = new ConfigService();
    const config = service.getConfig();

    expect(config.mermaidEnabled).to.equal(true);
    expect(config.mermaidAllowInUntrustedWorkspaces).to.equal(false);
    expect(config.toolbarMode).to.equal('basic');
    expect(config.imageDestination).to.equal('images/');
    expect(config.contentWidth).to.equal('comfortable');
  });

  it('reads current configuration for each resource access', () => {
    const getConfigurationStub = sinon.stub(vscode.workspace, 'getConfiguration');
    getConfigurationStub.onFirstCall().returns(createConfiguration({ toolbarMode: 'basic' }));
    getConfigurationStub.onSecondCall().returns(createConfiguration({ toolbarMode: 'advanced' }));
    const service = new ConfigService();
    const uri = vscode.Uri.file('/tmp/sample.md');
    expect(service.getToolbarMode(uri)).to.equal('basic');
    expect(service.getToolbarMode(uri)).to.equal('advanced');
    expect(getConfigurationStub.calledTwice).to.equal(true);
    expect(getConfigurationStub.alwaysCalledWithExactly('muninn', uri)).to.equal(true);
  });

  it('returns inspection details for settings', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      createConfiguration({
        mermaidEnabled: true,
        mermaidAllowInUntrustedWorkspaces: true,
        toolbarMode: 'advanced',
        imageDestination: 'assets/',
        contentWidth: 84,
      }),
    );

    const service = new ConfigService();
    const inspection = service.inspect();

    expect(inspection.mermaidEnabled?.globalValue).to.equal(true);
    expect(inspection.mermaidAllowInUntrustedWorkspaces?.globalValue).to.equal(true);
    expect(inspection.toolbarMode?.globalValue).to.equal('advanced');
    expect(inspection.imageDestination?.globalValue).to.equal('assets/');
    expect(inspection.contentWidth?.globalValue).to.equal(84);
  });

  it('exposes convenience getters for active settings', () => {
    sinon.stub(vscode.workspace, 'getConfiguration').returns(
      createConfiguration({
        mermaidEnabled: false,
        mermaidAllowInUntrustedWorkspaces: true,
        toolbarMode: 'advanced',
        imageDestination: 'assets/',
        contentWidth: 'full',
      }),
    );

    const service = new ConfigService();
    const uri = vscode.Uri.file('/workspace/readme.md');

    expect(service.getMermaidEnabled(uri)).to.equal(false);
    expect(service.getMermaidAllowInUntrustedWorkspaces(uri)).to.equal(true);
    expect(service.getToolbarMode(uri)).to.equal('advanced');
    expect(service.getImageDestination(uri)).to.equal('assets/');
    expect(service.getContentWidth(uri)).to.equal('full');
  });
});
