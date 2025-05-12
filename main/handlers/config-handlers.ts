import { ipcMain } from "electron";
import { getDb } from "../lib/mongodb"; // Corrected path: Use relative path from main process to renderer's lib
import { Collection, ObjectId } from "mongodb";
import { HardwareConfig, SavedConfigDocument } from "../../common/types"; // Correct import path
import createLogger from "../lib/logger";

// Create a logger for this module
const logger = createLogger("ConfigHandlers");

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
      .sort({ updatedAt: -1 })
      .toArray();
    logger.info(`Fetched: ${configs.length} configs`);
    // Important: Convert ObjectId to string for IPC serialization
    return configs.map((c) => ({ ...c, _id: c._id.toHexString() }));
  } catch (error: any) {
    logger.error("Error fetching configurations:", error);
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
      sequences: [], // Initialize with an empty sequences array
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await collection.insertOne(newConfig as SavedConfigDocument);

    // Fetch the inserted document to return it (with ObjectId converted)
    const insertedDoc = await collection.findOne({ _id: result.insertedId });

    if (!insertedDoc) {
      throw new Error("Failed to retrieve the newly created configuration.");
    }

    logger.success(
      `Created config '${trimmedName}' with ID: ${result.insertedId}`
    );
    // Convert ObjectId before sending back
    return { ...insertedDoc, _id: insertedDoc._id.toHexString() };
  } catch (error: any) {
    logger.error("Error creating configuration:", error);
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

    logger.info(`Found config '${config.name}' for ID: ${configId}`);
    // Convert ObjectId to string before sending
    return { ...config, _id: config._id.toHexString() };
  } catch (error: any) {
    logger.error(`Error fetching config ID ${configId}:`, error);
    throw new Error(`Error fetching configuration: ${error.message}`);
  }
}

// Handler for updating a config
async function handleUpdateConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string,
  updatePayload: Partial<SavedConfigDocument> // Accept a partial document for updates
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }

  // Validate that updatePayload is an object and not empty
  if (
    !updatePayload ||
    typeof updatePayload !== "object" ||
    Object.keys(updatePayload).length === 0
  ) {
    throw new Error("Invalid or empty update payload");
  }

  try {
    const collection = await getConfigurationsCollection();

    logger.debug("Update payload:", JSON.stringify(updatePayload, null, 2));

    // Construct the $set object dynamically from the payload
    const fieldsToUpdate: any = {};
    for (const key in updatePayload) {
      if (Object.prototype.hasOwnProperty.call(updatePayload, key)) {
        // We should not allow updating _id, createdAt
        if (key === "_id" || key === "createdAt") continue;

        // If a field is explicitly set to undefined in payload, it won't be included in $set
        // To remove a field, a $unset operation would be needed, which is not handled here.
        // For 'description', trim if it's a string.
        if (key === "description" && typeof updatePayload[key] === "string") {
          fieldsToUpdate[key] = (updatePayload[key] as string).trim();
        } else if (key === "name" && typeof updatePayload[key] === "string") {
          // Add validation for name if it's being updated (e.g., non-empty)
          const trimmedName = (updatePayload[key] as string).trim();
          if (!trimmedName) {
            throw new Error(
              "Configuration name cannot be empty if provided for update."
            );
          }
          // Potentially check for name uniqueness again if renaming is part of this generic update
          fieldsToUpdate[key] = trimmedName;
        } else {
          fieldsToUpdate[key] = updatePayload[key];
        }
      }
    }

    // Ensure updatedAt is always set
    fieldsToUpdate.updatedAt = new Date();

    // If fieldsToUpdate only contains updatedAt (meaning payload was empty or only contained protected fields)
    if (Object.keys(fieldsToUpdate).length === 1 && fieldsToUpdate.updatedAt) {
      // This case implies the payload was effectively empty after filtering for _id, createdAt.
      // We can either throw an error, or proceed to just update 'updatedAt'.
      // For now, let's allow just updating 'updatedAt' if an otherwise empty payload is sent.
      // If the original payload was truly empty, the check at the start of the function would catch it.
      logger.warn(
        `Update payload for ${configId} resulted in only updating 'updatedAt'. Original payload:`,
        updatePayload
      );
    }

    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      { $set: fieldsToUpdate }
    );

    if (updateResult.matchedCount === 0) {
      throw new Error("Configuration not found");
    }

    // Fetch and return the updated document
    const updatedDoc = await collection.findOne({
      _id: new ObjectId(configId),
    });
    if (!updatedDoc) {
      throw new Error("Failed to retrieve updated configuration.");
    }
    return { ...updatedDoc, _id: updatedDoc._id.toHexString() };
  } catch (error: any) {
    logger.error(`Error updating config ID ${configId}:`, error);
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

    logger.success(`Deleted config ID: ${configId}`);
    return { success: true, message: "Configuration deleted successfully" }; // Indicate success
  } catch (error: any) {
    logger.error(`Error deleting config ID ${configId}:`, error);
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

    logger.success(`Renamed config ID ${configId} to '${trimmedNewName}'`);
    return { success: true, message: "Configuration renamed successfully" };
  } catch (error: any) {
    logger.error(`Error renaming config ID ${configId}:`, error);
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

    logger.success(`Updated description for config ID: ${configId}`);
    return {
      success: true,
      message: "Configuration description updated successfully",
    };
  } catch (error: any) {
    logger.error(
      `Error updating description for config ID ${configId}:`,
      error
    );
    throw new Error(
      `Error updating configuration description: ${error.message}`
    );
  }
}

// Handler for duplicating a config
async function handleDuplicateConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format");
  }

  try {
    const collection = await getConfigurationsCollection();

    // Find the source configuration
    const sourceConfig = await collection.findOne({
      _id: new ObjectId(configId),
    });
    if (!sourceConfig) {
      throw new Error("Source configuration not found");
    }

    // Create a copy with a new name
    const newName = `${sourceConfig.name} (Copy)`;

    // Check if the name already exists
    const existingConfig = await collection.findOne({
      name: { $regex: `^${newName}$`, $options: "i" },
    });

    // If name exists, append a number
    let finalName = newName;
    if (existingConfig) {
      let counter = 1;
      while (true) {
        const nameWithCounter = `${newName} ${counter}`;
        const exists = await collection.findOne({
          name: { $regex: `^${nameWithCounter}$`, $options: "i" },
        });
        if (!exists) {
          finalName = nameWithCounter;
          break;
        }
        counter++;
      }
    }

    // Create new config document (without _id)
    const newConfig: Omit<SavedConfigDocument, "_id"> = {
      name: finalName,
      description: sourceConfig.description,
      hardware: sourceConfig.hardware,
      sequences: sourceConfig.sequences,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Insert the new configuration
    const result = await collection.insertOne(newConfig as SavedConfigDocument);

    // Fetch the inserted document to return it
    const insertedDoc = await collection.findOne({ _id: result.insertedId });
    if (!insertedDoc) {
      throw new Error("Failed to retrieve the newly duplicated configuration.");
    }

    logger.success(
      `Duplicated config '${sourceConfig.name}' to '${finalName}' with ID: ${result.insertedId}`
    );

    // Convert ObjectId before sending back
    return { ...insertedDoc, _id: insertedDoc._id.toHexString() };
  } catch (error: any) {
    logger.error(`Error duplicating config ID ${configId}:`, error);
    throw new Error(`Error duplicating configuration: ${error.message}`);
  }
}

// Handler for saving/updating a sequence within a configuration
async function handleSaveSequenceToConfig(
  _event: Electron.IpcMainInvokeEvent,
  configId: string,
  sequence: SavedConfigDocument["sequences"][0] // Type for a single sequence
) {
  if (!isValidObjectId(configId)) {
    throw new Error("Invalid Configuration ID format for saving sequence.");
  }
  if (!sequence || typeof sequence !== "object" || !sequence.id) {
    throw new Error("Invalid sequence data provided.");
  }

  try {
    const collection = await getConfigurationsCollection();
    const config = await collection.findOne({ _id: new ObjectId(configId) });

    if (!config) {
      throw new Error(`Configuration with ID ${configId} not found.`);
    }

    // Initialize sequences array if it doesn't exist
    if (!config.sequences) {
      config.sequences = [];
    }

    const sequenceIndex = config.sequences.findIndex(
      (s) => s.id === sequence.id
    );

    if (sequenceIndex > -1) {
      // Update existing sequence
      config.sequences[sequenceIndex] = {
        ...config.sequences[sequenceIndex], // Preserve existing fields not explicitly passed
        ...sequence, // Apply updates
        updatedAt: new Date().toISOString(), // Ensure updatedAt is fresh
      };
      logger.info(
        `Updated sequence ID '${sequence.id}' in config ID '${configId}'`
      );
    } else {
      // Add new sequence
      config.sequences.push({
        ...sequence,
        // Ensure createdAt and updatedAt are set for new sequences if not already
        createdAt: sequence.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      logger.success(
        `Added new sequence ID '${sequence.id}' to config ID '${configId}'`
      );
    }

    // Update the entire config document with the modified sequences array
    const updateResult = await collection.updateOne(
      { _id: new ObjectId(configId) },
      {
        $set: {
          sequences: config.sequences,
          updatedAt: new Date(), // Also update the config's updatedAt timestamp
        },
      }
    );

    if (updateResult.matchedCount === 0) {
      // Should not happen if config was found earlier
      throw new Error("Configuration not found during update operation.");
    }
    if (updateResult.modifiedCount === 0) {
      // This might happen if the sequence data was identical, which is not an error.
      logger.info(
        `Sequence data for '${sequence.id}' in config '${config.name}' was unchanged or save was trivial.`
      );
    }

    // Return the saved/updated sequence (or just a success message)
    // For consistency, let's return the sequence that was just processed.
    // Find it again from the possibly updated config.sequences array to ensure we return the most current state.
    const savedOrUpdatedSequence = config.sequences.find(
      (s) => s.id === sequence.id
    );

    return {
      success: true,
      message: `Sequence '${sequence.name}' saved successfully to config '${config.name}'.`,
      sequence: savedOrUpdatedSequence, // Return the sequence as it is in the DB
    };
  } catch (error: any) {
    logger.error(`Error saving sequence to config ID ${configId}:`, error);
    throw new Error(`Error saving sequence to configuration: ${error.message}`);
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
  ipcMain.handle("duplicate-config", handleDuplicateConfig);
  ipcMain.handle("save-sequence-to-config", handleSaveSequenceToConfig); // Register new handler
}
