const express = require("express");
const { asyncHandler, StatusCodeError } = require("../endpointHelper.js");
const docs = [
  {
    method: "GET",
    path: "/api/order/menu",
    description: "Get the pizza menu",
    example: `curl localhost:3000/api/order/menu`,
    response: [
      {
        id: 1,
        title: "Veggie",
        image: "pizza1.png",
        price: 0.0038,
        description: "A garden of delight",
      },
    ],
  },
  {
    method: "PUT",
    path: "/api/order/menu",
    requiresAuth: true,
    description: "Add an item to the menu",
    example: `curl -X PUT localhost:3000/api/order/menu -H 'Content-Type: application/json' -d '{ "title":"Student", "description": "No topping, no sauce, just carbs", "image":"pizza9.png", "price": 0.0001 }'  -H 'Authorization: Bearer tttttt'`,
    response: [
      {
        id: 1,
        title: "Student",
        description: "No topping, no sauce, just carbs",
        image: "pizza9.png",
        price: 0.0001,
      },
    ],
  },
  {
    method: "GET",
    path: "/api/order",
    requiresAuth: true,
    description: "Get the orders for the authenticated user",
    example: `curl -X GET localhost:3000/api/order  -H 'Authorization: Bearer tttttt'`,
    response: {
      dinerId: 4,
      orders: [
        {
          id: 1,
          franchiseId: 1,
          storeId: 1,
          date: "2024-06-05T05:14:40.000Z",
          items: [{ id: 1, menuId: 1, description: "Veggie", price: 0.05 }],
        },
      ],
      page: 1,
    },
  },
  {
    method: "POST",
    path: "/api/order",
    requiresAuth: true,
    description: "Create a order for the authenticated user",
    example: `curl -X POST localhost:3000/api/order -H 'Content-Type: application/json' -d '{"franchiseId": 1, "storeId":1, "items":[{ "menuId": 1, "description": "Veggie", "price": 0.05 }]}'  -H 'Authorization: Bearer tttttt'`,
    response: {
      order: {
        franchiseId: 1,
        storeId: 1,
        items: [{ menuId: 1, description: "Veggie", price: 0.05 }],
        id: 1,
      },
      jwt: "1111111111",
    },
  },
];

function createOrderRouter(deps) {
  const { db, role, authenticateToken, config, metricsManager, fetchImpl } =
    deps;
  const orderRouter = express.Router();
  orderRouter.docs = docs;

  // getMenu
  orderRouter.get(
    "/menu",
    asyncHandler(async (req, res) => {
      res.send(await db.getMenu());
    }),
  );

  // addMenuItem
  orderRouter.put(
    "/menu",
    authenticateToken,
    asyncHandler(async (req, res) => {
      if (!req.user.isRole(role.Admin)) {
        throw new StatusCodeError("unable to add menu item", 403);
      }

      const addMenuItemReq = req.body;
      await db.addMenuItem(addMenuItemReq);
      res.send(await db.getMenu());
    }),
  );

  // getOrders
  orderRouter.get(
    "/",
    authenticateToken,
    asyncHandler(async (req, res) => {
      res.json(await db.getOrders(req.user, req.query.page));
    }),
  );

  // createOrder
  orderRouter.post(
    "/",
    authenticateToken,
    asyncHandler(async (req, res) => {
      const startTime = Date.now();
      const orderReq = req.body;
      const order = await db.addDinerOrder(req.user, orderReq);
      const pizzasCount = Array.isArray(orderReq.items)
        ? orderReq.items.length
        : 0;
      const revenue = Array.isArray(orderReq.items)
        ? orderReq.items.reduce((sum, item) => sum + (item.price ?? 0), 0)
        : 0;

      const r = await fetchImpl(`${config.factory.url}/api/order`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          authorization: `Bearer ${config.factory.apiKey}`,
        },
        body: JSON.stringify({
          diner: {
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
          },
          order,
        }),
      });
      const j = await r.json();
      if (r.ok) {
        const durationMs = Date.now() - startTime;
        metricsManager.trackPizzaCreationSuccess({
          pizzasCount,
          revenue,
          franchiseId: order.franchiseId,
          storeId: order.storeId,
          dinerId: req.user.id,
        });
        metricsManager.trackPizzaCreationLatency("success", durationMs, {
          franchiseId: order.franchiseId,
          storeId: order.storeId,
          dinerId: req.user.id,
        });
        res.send({ order, followLinkToEndChaos: j.reportUrl, jwt: j.jwt });
      } else {
        const durationMs = Date.now() - startTime;
        metricsManager.trackPizzaCreationFailure({
          franchiseId: order.franchiseId,
          storeId: order.storeId,
          dinerId: req.user.id,
          reason: "factory_error",
        });
        metricsManager.trackPizzaCreationLatency("failure", durationMs, {
          franchiseId: order.franchiseId,
          storeId: order.storeId,
          dinerId: req.user.id,
        });
        res.status(500).send({
          message: "Failed to fulfill order at factory",
          followLinkToEndChaos: j.reportUrl,
        });
      }
    }),
  );

  return orderRouter;
}

module.exports = { createOrderRouter };
