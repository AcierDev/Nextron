import { ipcMain } from "electron";
import { getDb } from "../lib/mongodb"; // Corrected path: Use relative path from main process to renderer's lib
import { Collection, ObjectId } from "mongodb";
import { HardwareConfig, SavedConfigDocument } from "../../common/types"; // Correct import path

// Ensure this utility function can be called from the main process context.
// The path '@/' might resolve differently in main vs. renderer.
// You might need a dedicated db connection setup for the main process.
async function getConfigurationsCollection(): Promise<
  Collection<SavedConfigDocument>
> {
  const db = await getDb(); // Verify this works in main process
  return db.collection<SavedConfigDocument>("configs");
}

// Handler for fetching config list
async function handleGetConfigs() {
  try {
    const collection = await getConfigurationsCollection();
    const configs = await collection
      .find(
        {},
        {
          projection: {
            _id: 1,
            name: 1,
            description: 1,
            updatedAt: 1,
            "hardware.servos": 1,
            "hardware.steppers": 1,
            "hardware.pins": 1,
          },
        }
      )
      .sort({ name: 1 })
      .toArray();
    console.log("[Main:handleGetConfigs] Fetched:", configs.length, "configs");
    // Important: Convert ObjectId to string for IPC serialization
    return configs.map((c) => ({ ...c, _id: c._id.toHexString() }));
  } catch (error: any) {
    console.error("[Main:handleGetConfigs] Error:", error);
    // Rethrow or return an error structure for the renderer to handle
    throw new Error(`Error fetching configurations: ${error.message}`);
    // Or: return { error: `Error fetching configurations: ${error.message}` };
  }
}

// Handler for creating a new config
async function handleCreateConfig(
  _event: Electron.IpcMainInvokeEvent,
  name: string,
  description: string = ""
) {
  try {
    if (!name || typeof name !== "string" || name.trim().length === 0) {
      throw new Error(
        "Configuration name is required and must be a non-empty string"
      );
    }

    const collection = await getConfigurationsCollection();
    const trimmedName = name.trim();
    const trimmedDescription = description ? description.trim() : "";

    // Check if config name already exists (case-insensitive)
    const existingConfig = await collection.findOne({
      name: { $regex: `^${trimmedName}$`, $options: "i" },
    });
    if (existingConfig) {
      // Use a specific error type or code if needed
      throw new Error(`Configuration name '${trimmedName}' already exists.`);
    }

    const newConfig: Omit<SavedConfigDocument, "_id"> = {
      name: trimmedName,
      description: trimmedDescription,
      // Define default hardware structure upon creation
      hardware: {
        servos: [],
        steppers: [],
        sensors: [],
        relays: [],
        pins: [],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newConfig as SavedConfigDocument);

    // Fetch the inserted document to return it (with ObjectId converted)
    const insertedDoc = await collection.findOne({ _id: result.insertedId });

    if (!insertedDoc) {
      throw new Error("Failed to retrieve the newly created configuration.");
    }

    console.log(
      `[Main:handleCreateConfig] Created config '${trimmedName}' with ID: ${result.insertedId}`
    );
    // Convert ObjectId before sending back
    return { ...insertedDoc, _id: insertedDoc._id.toHexString() };
  } catch (error: any) {
    console.error("[Main:handleCreateConfig] Error:", error);
    // Rethrow or return an error structure
    throw new Error(`Error creating configuration: ${error.message}`);
    // Or: return { error: `Error creating configuration: ${error.message}` };
  }
}

// Helper to validate ObjectId (can be reused)
function isValidObjectId(id: string): boolean {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}

// Handler for fetching a single config by ID
async function handleGetConfigById(
  _event: Electron.IpcMainInvokeEvent,
  configId: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }
  try {
    const collection = await getConfigurationsCollection();
    const config = await collection.findOne({ _id: new ObjectId(configId) });

    if (!config) {
      throw new Error("Configuration not found"); // Or use a specific error code/type
    }

    console.log(
      `[Main:handleGetConfigById] Found config '${config.name}' for ID: ${configId}`
    );
    // Convert ObjectId to string before sending
    return { ...config, _id: config._id.toHexString() };
  } catch (error: any) {
    console.error(
      `[Main:handleGetConfigById] Error fetching config ID ${configId}:`,
      error
    );
    throw new Error(`Error fetching configuration: ${error.message}`);
  }
}

// Handler for updating a config
async function handleUpdateConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string,
  hardware: HardwareConfig,
  description?: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }
  // Basic validation for the hardware object structure (can be more detailed)
  if (!hardware || typeof hardware !== "object" || Array.isArray(hardware)) {
    throw new Error("Invalid hardware data format in request");
  }
  // Add more specific checks for servos, steppers, etc. if needed based on HardwareConfig type

  try {
    const collection = await getConfigurationsCollection();

    const updateData: any = {
      hardware: hardware,
      updatedAt: new Date(),
    };

    // Only include description in update if it's provided
    if (description !== undefined) {
      updateData.description = description.trim();
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      { $set: updateData }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error("Configuration not found");
    }

    console.log(`[Main:handleUpdateConfig] Updated config ID: ${configId}`);

    // Fetch and return the updated document
    const updatedDoc = await collection.findOne({
      _id: new ObjectId(configId),
    });
    if (!updatedDoc) {
      throw new Error("Failed to retrieve updated configuration."); // Should not happen if update succeeded
    }
    return { ...updatedDoc, _id: updatedDoc._id.toHexString() };
  } catch (error: any) {
    console.error(
      `[Main:handleUpdateConfig] Error updating config ID ${configId}:`,
      error
    );
    throw new Error(`Error updating configuration: ${error.message}`);
  }
}

// Handler for deleting a config
async function handleDeleteConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }
  try {
    const collection = await getConfigurationsCollection();
    const deleteResult = await collection.deleteOne({
      _id: new ObjectId(configId),
    });

    if (deleteResult.deletedCount === 0) {
      throw new Error("Configuration not found");
    }

    console.log(`[Main:handleDeleteConfig] Deleted config ID: ${configId}`);
    return { success: true, message: "Configuration deleted successfully" }; // Indicate success
  } catch (error: any) {
    console.error(
      `[Main:handleDeleteConfig] Error deleting config ID ${configId}:`,
      error
    );
    throw new Error(`Error deleting configuration: ${error.message}`);
  }
}

// Handler specifically for renaming a config
async function handleRenameConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string,
  newName: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }
  const trimmedNewName = newName.trim();
  if (!trimmedNewName) {
    throw new Error("New configuration name cannot be empty");
  }

  try {
    const collection = await getConfigurationsCollection();

    // Check if the new name already exists (excluding the current doc being renamed)
    const existingConfig = await collection.findOne({
      _id: { $ne: new ObjectId(configId) }, // Exclude self
      name: { $regex: `^${trimmedNewName}$`, $options: "i" },
    });
    if (existingConfig) {
      throw new Error(`Configuration name '${trimmedNewName}' already exists.`);
    }

    // Perform the rename operation
    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      {
        $set: {
          name: trimmedNewName,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error("Configuration not found for renaming");
    }

    console.log(
      `[Main:handleRenameConfig] Renamed config ID ${configId} to '${trimmedNewName}'`
    );
    return { success: true, message: "Configuration renamed successfully" };
  } catch (error: any) {
    console.error(
      `[Main:handleRenameConfig] Error renaming config ID ${configId}:`,
      error
    );
    throw new Error(`Error renaming configuration: ${error.message}`);
  }
}

// Handler specifically for updating the description
async function handleUpdateDescription(
  _event: Electron.IpcMainInvokeEvent,
  configId: string,
  description: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }

  try {
    const collection = await getConfigurationsCollection();
    const trimmedDescription = description.trim();

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      {
        $set: {
          description: trimmedDescription,
          updatedAt: new Date(),
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error("Configuration not found");
    }

    console.log(
      `[Main:handleUpdateDescription] Updated description for config ID: ${configId}`
    );
    return {
      success: true,
      message: "Configuration description updated successfully",
    };
  } catch (error: any) {
    console.error(
      `[Main:handleUpdateDescription] Error updating description for config ID ${configId}:`,
      error
    );
    throw new Error(
      `Error updating configuration description: ${error.message}`
    );
  }
}

// Updated setup function
export function setupConfigHandlers() {
  ipcMain.handle("get-configs", handleGetConfigs);
  ipcMain.handle("create-config", handleCreateConfig);
  ipcMain.handle("get-config-by-id", handleGetConfigById);
  ipcMain.handle("update-config", handleUpdateConfig);
  ipcMain.handle("delete-config", handleDeleteConfig);
  ipcMain.handle("rename-config", handleRenameConfig);
  ipcMain.handle("update-description", handleUpdateDescription);
}
