module.exports.permissions = {
  stock: {
    group: {
      create: false,
      destroy: false,
      read: false,
      register: false,
      unregister: false,
      update: false
    },
    host: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    image: {
      capture: false,
      create: false,
      deploy: false,
      destroy: false,
      read: false,
      update: false
    },
    role: {
      assign: false,
      create: false,
      destroy: false,
      read: false,
      unassign: false,
      update: false
    },
    task: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    user: {
      create: false,
      destroy: false,
      read: false,
      update: false
    },
    workflow: {
      create: false,
      destroy: false,
      read: false,
      update: false
    }
  }
};
