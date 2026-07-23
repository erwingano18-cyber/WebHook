import { createAsyncThunk, createSlice } from "@reduxjs/toolkit";
import {
  forwardLeadEmail,
  getConfigStatus,
  getLeads,
  syncLeadToSuiteCrm,
} from "./api";

export const fetchLeads = createAsyncThunk("leads/fetch", async () =>
  getLeads(),
);
export const fetchConfig = createAsyncThunk("leads/config", async () =>
  getConfigStatus(),
);

export const runForwardEmail = createAsyncThunk(
  "leads/forward",
  async (id, { dispatch }) => {
    await forwardLeadEmail(id);
    await dispatch(fetchLeads());
    return id;
  },
);

export const runSuiteSync = createAsyncThunk(
  "leads/suitecrm",
  async (id, { dispatch }) => {
    await syncLeadToSuiteCrm(id);
    await dispatch(fetchLeads());
    return id;
  },
);

const leadsSlice = createSlice({
  name: "leads",
  initialState: {
    items: [],
    status: "idle",
    config: null,
    error: null,
    actionById: {},
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchLeads.pending, (state) => {
        state.status = "loading";
        state.error = null;
      })
      .addCase(fetchLeads.fulfilled, (state, action) => {
        state.status = "succeeded";
        state.items = action.payload;
      })
      .addCase(fetchLeads.rejected, (state, action) => {
        state.status = "failed";
        state.error = action.error.message || "Unable to load leads";
      })
      .addCase(fetchConfig.fulfilled, (state, action) => {
        state.config = action.payload;
      })
      .addCase(runForwardEmail.pending, (state, action) => {
        state.actionById[action.meta.arg] = "forwarding";
      })
      .addCase(runForwardEmail.fulfilled, (state, action) => {
        delete state.actionById[action.payload];
      })
      .addCase(runForwardEmail.rejected, (state, action) => {
        delete state.actionById[action.meta.arg];
        state.error = action.error.message || "Failed to forward email";
      })
      .addCase(runSuiteSync.pending, (state, action) => {
        state.actionById[action.meta.arg] = "syncing";
      })
      .addCase(runSuiteSync.fulfilled, (state, action) => {
        delete state.actionById[action.payload];
      })
      .addCase(runSuiteSync.rejected, (state, action) => {
        delete state.actionById[action.meta.arg];
        state.error = action.error.message || "Failed to sync to SuiteCRM";
      });
  },
});

export default leadsSlice.reducer;
