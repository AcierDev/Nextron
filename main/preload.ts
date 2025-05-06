import { contextBridge, ipcRenderer, IpcRendererEvent } from "electron";

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value);
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args);
    ipcRenderer.on(channel, subscription);

    return () => {
      ipcRenderer.removeListener(channel, subscription);
    };
  },
  invoke(channel: string, ...args: unknown[]) {
    return ipcRenderer.invoke(channel, ...args);
  },
};

contextBridge.exposeInMainWorld("ipc", handler);

contextBridge.exposeInMainWorld("electron", {
  getSerialPorts: () => ipcRenderer.invoke("get-serial-ports"),
  flashFirmware: (port: string) => {
    // Create a promise that will resolve when the firmware upload is complete
    return new Promise((resolve, reject) => {
      // Set up a listener for progress events
      const progressListener = (event: IpcRendererEvent, data: string) => {
        // Emit the progress event to any registered callbacks
        document.dispatchEvent(
          new CustomEvent("firmware-progress", { detail: data })
        );

        // Check if this is the final success message
        if (data.includes("[SUCCESS]")) {
          // Clean up listener to avoid memory leaks
          ipcRenderer.removeListener(
            "firmware-upload-progress",
            progressListener
          );
        }
      };

      // Register the progress listener
      ipcRenderer.on("firmware-upload-progress", progressListener);

      // Invoke the firmware upload
      ipcRenderer
        .invoke("flash-firmware", port)
        .then((result) => {
          // Clean up listener to avoid memory leaks
          ipcRenderer.removeListener(
            "firmware-upload-progress",
            progressListener
          );
          resolve(result);
        })
        .catch((error) => {
          // Clean up listener to avoid memory leaks
          ipcRenderer.removeListener(
            "firmware-upload-progress",
            progressListener
          );
          reject(error);
        });
    });
  },
  startIpFinder: () => ipcRenderer.invoke("start-ip-finder"),
  stopIpFinder: () => ipcRenderer.invoke("stop-ip-finder"),
});

export type IpcHandler = typeof handler;
