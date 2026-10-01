import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC, type CapyApi } from '@shared/types'

function listen<A extends unknown[]>(channel: string, cb: (...args: A) => void): () => void {
  const handler = (_e: IpcRendererEvent, ...args: unknown[]): void => cb(...(args as A))
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CapyApi = {
  getStatus: () => ipcRenderer.invoke(IPC.getStatus),
  getUpdateState: () => ipcRenderer.invoke(IPC.getUpdateState),
  checkForUpdates: () => ipcRenderer.invoke(IPC.checkForUpdates),
  installUpdate: () => ipcRenderer.invoke(IPC.installUpdate),
  onUpdateState: (cb) => listen(IPC.updateState, cb),
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
  forkSideChat: (dir, id) => ipcRenderer.invoke(IPC.forkSideChat, dir, id),
  deleteSession: (dir, id) => ipcRenderer.invoke(IPC.deleteSession, dir, id),
  prompt: (dir, id, text, agent, system, files) => ipcRenderer.invoke(IPC.prompt, dir, id, text, agent, system, files),
  abort: (dir, id) => ipcRenderer.invoke(IPC.abort, dir, id),
  respondPermission: (dir, reqId, res) => ipcRenderer.invoke(IPC.respondPermission, dir, reqId, res),
  setAccessMode: (mode) => ipcRenderer.invoke(IPC.setAccessMode, mode),
  oc: (method, params) => ipcRenderer.invoke(IPC.oc, method, params),
  ptyOpen: (dir, cols, rows) => ipcRenderer.invoke(IPC.ptyOpen, dir, cols, rows),
  ptyWrite: (id, data) => ipcRenderer.send(IPC.ptyWrite, id, data),
  ptyResize: (dir, id, cols, rows) => ipcRenderer.send(IPC.ptyResize, dir, id, cols, rows),
  ptyClose: (dir, id) => ipcRenderer.invoke(IPC.ptyClose, dir, id),
  onPtyData: (cb) => listen(IPC.ptyData, cb),
  onPtyExit: (cb) => listen(IPC.ptyExit, cb),
  replyQuestion: (dir, reqId, answers) => ipcRenderer.invoke(IPC.replyQuestion, dir, reqId, answers),
  rejectQuestion: (dir, reqId) => ipcRenderer.invoke(IPC.rejectQuestion, dir, reqId),
  onStatus: (cb) => listen(IPC.status, cb),
  onModelProgress: (cb) => listen(IPC.modelProgress, cb),
  onAgentEvent: (cb) => listen(IPC.agentEvent, cb)
}

contextBridge.exposeInMainWorld('api', api)
