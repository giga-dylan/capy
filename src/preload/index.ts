import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CapyApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CapyApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  getSettings: () => ipcRenderer.invoke(IPC.getSettings),
  saveSettings: (patch) => ipcRenderer.invoke(IPC.saveSettings, patch),
  getEffectiveConfig: () => ipcRenderer.invoke(IPC.getEffectiveConfig),
  opencodeConfigDir: () => ipcRenderer.invoke(IPC.opencodeConfigDir),
  inspect: () => ipcRenderer.invoke(IPC.inspect),
  listExtensions: (kind) => ipcRenderer.invoke(IPC.listExtensions, kind),
  saveExtension: (kind, name, content) => ipcRenderer.invoke(IPC.saveExtension, kind, name, content),
  deleteExtension: (kind, name) => ipcRenderer.invoke(IPC.deleteExtension, kind, name),
  getRules: () => ipcRenderer.invoke(IPC.getRules),
  saveRules: (content) => ipcRenderer.invoke(IPC.saveRules, content),
  revealPath: (path) => ipcRenderer.invoke(IPC.revealPath, path),
  chooseModelsDir: () => ipcRenderer.invoke(IPC.chooseModelsDir),
  listModels: () => ipcRenderer.invoke(IPC.listModels),
  pullModel: (name) => ipcRenderer.invoke(IPC.pullModel, name),
  importModel: () => ipcRenderer.invoke(IPC.importModel),
  deleteModel: (name) => ipcRenderer.invoke(IPC.deleteModel, name),
  chatsDirectory: () => ipcRenderer.invoke(IPC.chatsDirectory),
  listProjects: () => ipcRenderer.invoke(IPC.listProjects),
  addProject: () => ipcRenderer.invoke(IPC.addProject),
  removeProject: (dir) => ipcRenderer.invoke(IPC.removeProject, dir),
  listSessions: (dir) => ipcRenderer.invoke(IPC.listSessions, dir),
  getMessages: (dir, id) => ipcRenderer.invoke(IPC.getMessages, dir, id),
  createSession: (dir) => ipcRenderer.invoke(IPC.createSession, dir),
  deleteSession: (dir, id) => ipcRenderer.invoke(IPC.deleteSession, dir, id),
  prompt: (dir, id, text, agent) => ipcRenderer.invoke(IPC.prompt, dir, id, text, agent),
  abort: (dir, id) => ipcRenderer.invoke(IPC.abort, dir, id),
  respondPermission: (dir, reqId, res) => ipcRenderer.invoke(IPC.respondPermission, dir, reqId, res),
  onStatus: (cb) => listen(IPC.status, cb),
  onModelProgress: (cb) => listen(IPC.modelProgress, cb),
  onAgentEvent: (cb) => listen(IPC.agentEvent, cb)
}

contextBridge.exposeInMainWorld('api', api)
