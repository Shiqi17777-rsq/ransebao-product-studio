function createRuntimeStateBridge() {
  let activeAutomationRun = null;
  let activeImageTask = null;

  return {
    getActiveAutomationRun() {
      return activeAutomationRun;
    },
    setActiveAutomationRun(nextState) {
      activeAutomationRun = nextState;
    },
    getActiveImageTask() {
      return activeImageTask;
    },
    setActiveImageTask(nextState) {
      activeImageTask = nextState;
    }
  };
}

module.exports = {
  createRuntimeStateBridge
};
