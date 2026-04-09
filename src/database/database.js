const mysql = require("mysql2/promise");
const bcrypt = require("bcrypt");
const config = require("../config.js");
const { StatusCodeError } = require("../endpointHelper.js");
const { Role } = require("../model/model.js");
const dbModel = require("./dbModel.js");
const { GrafanaLogger } = require("../logger.ts");
const { MAX_PAGE_LIMIT } = require("../util/pagination.js");

const dbLogger = new GrafanaLogger();

/** Allowed (table, column) pairs for {@link DB.getID}. */
const GET_ID_ALLOWED = {
  franchise: new Set(["name"]),
};
class DB {
  constructor() {
    this.initialized = this.initializeDatabase();
  }

  async getMenu() {
    const connection = await this.getConnection();
    try {
      const rows = await this.query(connection, `SELECT * FROM menu`);
      return rows;
    } finally {
      connection.end();
    }
  }

  async addMenuItem(item) {
    const connection = await this.getConnection();
    try {
      const addResult = await this.query(
        connection,
        `INSERT INTO menu (title, description, image, price) VALUES (?, ?, ?, ?)`,
        [item.title, item.description, item.image, item.price],
      );
      return { ...item, id: addResult.insertId };
    } finally {
      connection.end();
    }
  }

  async addUser(user) {
    const connection = await this.getConnection();
    try {
      const hashedPassword = await bcrypt.hash(user.password, 10);

      let userResult;
      try {
        userResult = await this.query(
          connection,
          `INSERT INTO user (name, email, password) VALUES (?, ?, ?)`,
          [user.name, user.email, hashedPassword],
        );
      } catch (err) {
        if (err?.code === "ER_DUP_ENTRY") {
          throw new StatusCodeError("unable to register", 404);
        }
        throw err;
      }
      const userId = userResult.insertId;
      for (const role of user.roles) {
        switch (role.role) {
          case Role.Franchisee: {
            const franchiseId = await this.getID(
              connection,
              "name",
              role.object,
              "franchise",
            );
            await this.query(
              connection,
              `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
              [userId, role.role, franchiseId],
            );
            break;
          }
          default: {
            await this.query(
              connection,
              `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
              [userId, role.role, 0],
            );
            break;
          }
        }
      }
      return { ...user, id: userId, password: undefined };
    } finally {
      connection.end();
    }
  }

  async getUser(email, password) {
    const connection = await this.getConnection();
    try {
      const userResult = await this.query(
        connection,
        `SELECT * FROM user WHERE email=? LIMIT 1`,
        [email],
      );
      const user = userResult[0];
      if (
        !user ||
        typeof password !== "string" ||
        password.length === 0 ||
        !(await bcrypt.compare(password, user.password))
      ) {
        throw new StatusCodeError("invalid credentials", 401);
      }

      const roleResult = await this.query(
        connection,
        `SELECT * FROM userRole WHERE userId=?`,
        [user.id],
      );
      const roles = roleResult.map((r) => {
        return { objectId: r.objectId || undefined, role: r.role };
      });

      return { ...user, roles: roles, password: undefined };
    } finally {
      connection.end();
    }
  }

  async getUserById(userId) {
    const connection = await this.getConnection();
    try {
      const userResult = await this.query(
        connection,
        `SELECT * FROM user WHERE id=?`,
        [userId],
      );
      const user = userResult[0];
      if (!user) {
        throw new StatusCodeError("unknown user", 404);
      }
      const roleResult = await this.query(
        connection,
        `SELECT * FROM userRole WHERE userId=?`,
        [user.id],
      );
      const roles = roleResult.map((r) => {
        return { objectId: r.objectId || undefined, role: r.role };
      });
      return { ...user, roles, password: undefined };
    } finally {
      connection.end();
    }
  }

  async updateUser(userId, name, email, password) {
    const connection = await this.getConnection();
    try {
      const setClauses = [];
      const values = [];
      if (password) {
        const hashedPassword = await bcrypt.hash(password, 10);
        setClauses.push("password=?");
        values.push(hashedPassword);
      }
      if (email) {
        setClauses.push("email=?");
        values.push(email);
      }
      if (name) {
        setClauses.push("name=?");
        values.push(name);
      }
      if (setClauses.length > 0) {
        values.push(userId);
        await this.query(
          connection,
          `UPDATE user SET ${setClauses.join(", ")} WHERE id=?`,
          values,
        );
      }
      return this.getUserById(userId);
    } finally {
      connection.end();
    }
  }

  async loginUser(userId, token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      await this.query(
        connection,
        `INSERT INTO auth (token, userId) VALUES (?, ?) ON DUPLICATE KEY UPDATE token=token`,
        [token, userId],
      );
    } finally {
      connection.end();
    }
  }

  async isLoggedIn(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      const authResult = await this.query(
        connection,
        `SELECT userId FROM auth WHERE token=?`,
        [token],
      );
      return authResult.length > 0;
    } finally {
      connection.end();
    }
  }

  async logoutUser(token) {
    token = this.getTokenSignature(token);
    const connection = await this.getConnection();
    try {
      await this.query(connection, `DELETE FROM auth WHERE token=?`, [token]);
    } finally {
      connection.end();
    }
  }

  async getOrders(user, page = 1) {
    const connection = await this.getConnection();
    try {
      const listPerPage = Math.min(
        MAX_PAGE_LIMIT,
        Math.max(1, Math.floor(Number(config.db.listPerPage)) || 10),
      );
      const pageNum = Math.max(1, Math.floor(Number(page)) || 1);
      const offset = (pageNum - 1) * listPerPage;
      const orders = await this.query(
        connection,
        `SELECT id, franchiseId, storeId, date FROM dinerOrder WHERE dinerId=? LIMIT ? OFFSET ?`,
        [user.id, listPerPage, offset],
      );
      for (const order of orders) {
        let items = await this.query(
          connection,
          `SELECT id, menuId, description, price FROM orderItem WHERE orderId=?`,
          [order.id],
        );
        order.items = items;
      }
      return { dinerId: user.id, orders: orders, page: pageNum };
    } finally {
      connection.end();
    }
  }

  async addDinerOrder(user, order) {
    const connection = await this.getConnection();
    try {
      const orderResult = await this.query(
        connection,
        `INSERT INTO dinerOrder (dinerId, franchiseId, storeId, date) VALUES (?, ?, ?, now())`,
        [user.id, order.franchiseId, order.storeId],
      );
      const orderId = orderResult.insertId;
      const resolvedItems = [];
      for (const item of order.items) {
        const menuRows = await this.query(
          connection,
          `SELECT id, description, price FROM menu WHERE id=?`,
          [item.menuId],
        );
        if (menuRows.length === 0) {
          throw new StatusCodeError("unknown menu item", 400);
        }
        const menuRow = menuRows[0];
        await this.query(
          connection,
          `INSERT INTO orderItem (orderId, menuId, description, price) VALUES (?, ?, ?, ?)`,
          [orderId, menuRow.id, menuRow.description, menuRow.price],
        );
        resolvedItems.push({
          menuId: menuRow.id,
          description: menuRow.description,
          price: menuRow.price,
        });
      }
      return {
        ...order,
        items: resolvedItems,
        id: orderId,
      };
    } finally {
      connection.end();
    }
  }

  async createFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      for (const admin of franchise.admins) {
        const adminUser = await this.query(
          connection,
          `SELECT id, name FROM user WHERE email=?`,
          [admin.email],
        );
        if (adminUser.length == 0) {
          throw new StatusCodeError(
            `unknown user for franchise admin ${admin.email} provided`,
            404,
          );
        }
        admin.id = adminUser[0].id;
        admin.name = adminUser[0].name;
      }

      const franchiseResult = await this.query(
        connection,
        `INSERT INTO franchise (name) VALUES (?)`,
        [franchise.name],
      );
      franchise.id = franchiseResult.insertId;

      for (const admin of franchise.admins) {
        await this.query(
          connection,
          `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
          [admin.id, Role.Franchisee, franchise.id],
        );
      }

      return franchise;
    } finally {
      connection.end();
    }
  }

  async deleteFranchise(franchiseId) {
    const connection = await this.getConnection();
    try {
      await connection.beginTransaction();
      try {
        await this.query(connection, `DELETE FROM store WHERE franchiseId=?`, [
          franchiseId,
        ]);
        await this.query(connection, `DELETE FROM userRole WHERE objectId=?`, [
          franchiseId,
        ]);
        await this.query(connection, `DELETE FROM franchise WHERE id=?`, [
          franchiseId,
        ]);
        await connection.commit();
      } catch {
        await connection.rollback();
        throw new StatusCodeError("unable to delete franchise", 500);
      }
    } finally {
      connection.end();
    }
  }

  async getFranchises(authUser, page = 0, limit = 10, nameFilter = "*") {
    const connection = await this.getConnection();

    const safeLimit = Math.min(
      MAX_PAGE_LIMIT,
      Math.max(1, Math.floor(Number(limit)) || 10),
    );
    const safePage = Math.max(0, Math.floor(Number(page)) || 0);
    const offset = safePage * safeLimit;
    const limitPlusOne = safeLimit + 1;
    nameFilter = String(nameFilter ?? "*").replace(/\*/g, "%");

    try {
      let franchises = await this.query(
        connection,
        `SELECT id, name FROM franchise WHERE name LIKE ? LIMIT ? OFFSET ?`,
        [nameFilter, limitPlusOne, offset],
      );

      const more = franchises.length > safeLimit;
      if (more) {
        franchises = franchises.slice(0, safeLimit);
      }

      for (const franchise of franchises) {
        if (authUser?.isRole(Role.Admin)) {
          await this.getFranchise(franchise);
        } else {
          franchise.stores = await this.query(
            connection,
            `SELECT id, name FROM store WHERE franchiseId=?`,
            [franchise.id],
          );
        }
      }
      return [franchises, more];
    } finally {
      connection.end();
    }
  }

  async getUserFranchises(userId) {
    const connection = await this.getConnection();
    try {
      let franchiseIds = await this.query(
        connection,
        `SELECT objectId FROM userRole WHERE role='franchisee' AND userId=?`,
        [userId],
      );
      if (franchiseIds.length === 0) {
        return [];
      }

      const ids = franchiseIds
        .map((v) => v.objectId)
        .map((id) => parseInt(String(id), 10))
        .filter((id) => Number.isInteger(id) && id > 0);
      if (ids.length === 0) {
        return [];
      }
      const placeholders = ids.map(() => "?").join(", ");
      const franchises = await this.query(
        connection,
        `SELECT id, name FROM franchise WHERE id IN (${placeholders})`,
        ids,
      );
      for (const franchise of franchises) {
        await this.getFranchise(franchise);
      }
      return franchises;
    } finally {
      connection.end();
    }
  }

  async getFranchise(franchise) {
    const connection = await this.getConnection();
    try {
      franchise.admins = await this.query(
        connection,
        `SELECT u.id, u.name, u.email FROM userRole AS ur JOIN user AS u ON u.id=ur.userId WHERE ur.objectId=? AND ur.role='franchisee'`,
        [franchise.id],
      );

      franchise.stores = await this.query(
        connection,
        `SELECT s.id, s.name, COALESCE(SUM(oi.price), 0) AS totalRevenue FROM dinerOrder AS do JOIN orderItem AS oi ON do.id=oi.orderId RIGHT JOIN store AS s ON s.id=do.storeId WHERE s.franchiseId=? GROUP BY s.id`,
        [franchise.id],
      );

      return franchise;
    } finally {
      connection.end();
    }
  }

  async createStore(franchiseId, store) {
    const connection = await this.getConnection();
    try {
      const insertResult = await this.query(
        connection,
        `INSERT INTO store (franchiseId, name) VALUES (?, ?)`,
        [franchiseId, store.name],
      );
      return { id: insertResult.insertId, franchiseId, name: store.name };
    } finally {
      connection.end();
    }
  }

  async deleteStore(franchiseId, storeId) {
    const connection = await this.getConnection();
    try {
      await this.query(
        connection,
        `DELETE FROM store WHERE franchiseId=? AND id=?`,
        [franchiseId, storeId],
      );
    } finally {
      connection.end();
    }
  }

  getTokenSignature(token) {
    const parts = token.split(".");
    if (parts.length > 2) {
      return parts[2];
    }
    return "";
  }

  async query(connection, sql, params) {
    const startedAt = Date.now();
    try {
      const [results] = await connection.execute(sql, params);
      dbLogger.log("info", "db-query", {
        durationMs: Date.now() - startedAt,
        sql,
        params,
        resultType: Array.isArray(results) ? "rows" : "result",
        rowCount: Array.isArray(results) ? results.length : undefined,
      });
      return results;
    } catch (err) {
      dbLogger.log("error", "db-query", {
        durationMs: Date.now() - startedAt,
        sql,
        params,
        error: {
          message: err?.message,
          name: err?.name,
        },
      });
      throw err;
    }
  }

  async getID(connection, key, value, table) {
    const allowed = GET_ID_ALLOWED[table];
    if (!allowed || !allowed.has(key)) {
      throw new Error("Invalid table or column for getID");
    }
    const [rows] = await connection.execute(
      `SELECT id FROM ${table} WHERE ${key}=?`,
      [value],
    );
    if (rows.length > 0) {
      return rows[0].id;
    }
    throw new Error("No ID found");
  }

  async getConnection() {
    // Make sure the database is initialized before trying to get a connection.
    await this.initialized;
    return this._getConnection();
  }

  async _getConnection(setUse = true) {
    const connection = await mysql.createConnection({
      host: config.db.connection.host,
      user: config.db.connection.user,
      password: config.db.connection.password,
      connectTimeout: config.db.connection.connectTimeout,
      decimalNumbers: true,
    });
    if (setUse) {
      await connection.query(`USE ${config.db.connection.database}`);
    }
    return connection;
  }

  async initializeDatabase() {
    try {
      const connection = await this._getConnection(false);
      try {
        const dbExists = await this.checkDatabaseExists(connection);
        console.log(
          dbExists ? "Database exists" : "Database does not exist, creating it",
        );

        await connection.query(
          `CREATE DATABASE IF NOT EXISTS ${config.db.connection.database}`,
        );
        await connection.query(`USE ${config.db.connection.database}`);

        if (!dbExists) {
          console.log("Successfully created database");
        }

        for (const statement of dbModel.tableCreateStatements) {
          await connection.query(statement);
        }

        try {
          await connection.query(
            `ALTER TABLE user ADD UNIQUE KEY user_email_unique (email)`,
          );
        } catch {
          /* constraint may already exist on older schemas */
        }

        if (
          !dbExists &&
          process.env.SEED_DEFAULT_ADMIN === "true" &&
          process.env.ADMIN_EMAIL &&
          process.env.ADMIN_PASSWORD &&
          process.env.ADMIN_PASSWORD.length >= 8
        ) {
          const adminName = process.env.ADMIN_NAME || "Admin";
          const adminEmail = process.env.ADMIN_EMAIL;
          const hashedPassword = await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            10,
          );
          const [insertHeader] = await connection.execute(
            `INSERT INTO user (name, email, password) VALUES (?, ?, ?)`,
            [adminName, adminEmail, hashedPassword],
          );
          const userId = insertHeader.insertId;
          await connection.execute(
            `INSERT INTO userRole (userId, role, objectId) VALUES (?, ?, ?)`,
            [userId, Role.Admin, 0],
          );
        } else if (!dbExists) {
          console.log(
            "No default admin seeded (set SEED_DEFAULT_ADMIN=true and ADMIN_EMAIL / ADMIN_PASSWORD with length >= 8)",
          );
        }
      } finally {
        connection.end();
      }
    } catch (err) {
      console.error(
        JSON.stringify({
          message: "Error initializing database",
          exception: err.message,
          connection: config.db.connection,
        }),
      );
    }
  }

  async checkDatabaseExists(connection) {
    const [rows] = await connection.execute(
      `SELECT SCHEMA_NAME FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME = ?`,
      [config.db.connection.database],
    );
    return rows.length > 0;
  }
}

const db = new DB();
module.exports = { Role, DB: db };
