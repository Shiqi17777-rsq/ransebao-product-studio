function createRuntimeStateBridge() {
  let activeAutomationRun = null;
  let activeImageTask = null;
  let activeVideoTask = null;

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
    },
    getActiveVideoTask() {
      return activeVideoTask;
    },
    setActiveVideoTask(nextState) {
      activeVideoTask = nextState;
    }
  };
}

module.exports = {
  createRuntimeStateBridge
};
