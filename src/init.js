const { Role, DB } = require("./database/database.js");

const name = process.argv[2];
const email = process.argv[3];
const password = process.env.INIT_ADMIN_PASSWORD || process.argv[4];

if (!name || !email || !password) {
  console.log(
    "Usage: node init.js <name> <email> [password]\n" +
      "Set INIT_ADMIN_PASSWORD or pass password as the 4th argument.",
  );
  process.exit(1);
}

const user = { name, email, password, roles: [{ role: Role.Admin }] };
DB.addUser(user).then((r) => console.log("created user: ", r));
