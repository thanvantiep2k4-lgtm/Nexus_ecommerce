/*
 * init-users.js — tạo user và quyền cho MongoDB. Chạy bằng mongosh.
 *
 * Tự chạy MỘT LẦN khi container MongoDB khởi tạo lần đầu (file được mount vào
 * /docker-entrypoint-initdb.d/). Biến môi trường (mật khẩu…) lấy từ environment của container.
 *
 * Muốn chạy lại trên MongoDB đã có dữ liệu (ví dụ thêm user mới), idempotent:
 *   docker exec -i nexusmart-mongodb mongosh -u root -p <mật_khẩu_root> \
 *     --authenticationDatabase admin /docker-entrypoint-initdb.d/10-init-users.js
 *
 * Định nghĩa user/quyền và giải thích nằm ở /mongo-scripts/users.config.js.
 */
load('/mongo-scripts/users.config.js');

buildUserCommands(process.env).forEach(function (step) {
  var target = db.getSiblingDB(step.db);
  var name = step.command.createRole || step.command.createUser;
  try {
    target.runCommand(step.command);
    print('[init-users] đã tạo ' + name);
  } catch (e) {
    // 51002 = role đã tồn tại, 51003 = user đã tồn tại -> cập nhật cho khớp định nghĩa mới.
    if (e.code === 51002 || e.code === 51003) {
      target.runCommand(toUpdateCommand(step.command));
      print('[init-users] đã cập nhật ' + name);
    } else {
      throw e;
    }
  }
});
