#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import pymysql
import sys

DB_CONFIG = {
    'host': 'localhost',
    'user': 'root',
    'password': '123456',   # 请修改为您的 MySQL 密码
    'database': 'phrolova_game',
    'charset': 'utf8mb4'
}

def connect_db():
    try:
        conn = pymysql.connect(**DB_CONFIG)
        return conn
    except pymysql.Error as e:
        print(f"❌ 数据库连接失败: {e}")
        sys.exit(1)

def add_character(conn):
    print("\n--- 添加新角色 ---")
    name = input("姓名: ").strip()
    if not name:
        print("❌ 姓名不能为空")
        return
    attribute = input("属性 (如: 湮灭, 导电, 热熔, 气动, 冷凝, 衍射): ").strip()
    if not attribute:
        print("❌ 属性不能为空")
        return
    while True:
        star_input = input("星级 (4或5): ").strip()
        if star_input.isdigit() and int(star_input) in (4, 5):
            star_rating = int(star_input)
            break
        print("⚠️ 星级必须为 4 或 5，请重新输入")
    weapon = input("武器 (如: 长刃, 臂铠, 佩枪, 迅刀, 音感仪): ").strip()
    if not weapon:
        print("❌ 武器不能为空")
        return
    birthplace = input("出生地: ").strip()
    if not birthplace:
        print("❌ 出生地不能为空")
        return
    while True:
        version_input = input("实装版本 (如: 1.0, 2.3): ").strip()
        try:
            version = float(version_input)
            break
        except ValueError:
            print("⚠️ 版本号必须是数字（例如 1.0），请重新输入")

    sql = """
        INSERT INTO characters (name, attribute, star_rating, weapon, birthplace, version)
        VALUES (%s, %s, %s, %s, %s, %s)
    """
    try:
        with conn.cursor() as cursor:
            cursor.execute(sql, (name, attribute, star_rating, weapon, birthplace, version))
            conn.commit()
            print(f"✅ 角色 '{name}' 添加成功！")
    except pymysql.IntegrityError as e:
        if e.args[0] == 1062:
            print(f"❌ 错误: 角色 '{name}' 已存在，请使用不同姓名。")
        else:
            print(f"❌ 数据库完整性错误: {e}")
    except pymysql.Error as e:
        print(f"❌ 数据库错误: {e}")

def transfer_score(conn):
    """转移玩家分数：用第一个玩家的分数覆盖第二个玩家的分数，然后删除第一个玩家"""
    print("\n--- 转移玩家分数（覆盖模式） ---")
    player1 = input("请输入第一个玩家ID（将被移除）: ").strip()
    if not player1:
        print("❌ 玩家ID不能为空")
        return
    player2 = input("请输入第二个玩家ID（接收分数）: ").strip()
    if not player2:
        print("❌ 玩家ID不能为空")
        return
    if player1 == player2:
        print("❌ 两个玩家ID不能相同")
        return

    try:
        with conn.cursor() as cursor:
            # 检查玩家1是否存在
            cursor.execute("SELECT score FROM players WHERE player_id = %s", (player1,))
            row1 = cursor.fetchone()
            if not row1:
                print(f"❌ 玩家 '{player1}' 不存在")
                return
            score1 = row1[0]

            # 检查玩家2是否存在
            cursor.execute("SELECT score FROM players WHERE player_id = %s", (player2,))
            row2 = cursor.fetchone()
            if not row2:
                print(f"❌ 玩家 '{player2}' 不存在")
                return

            # 直接覆盖（不累加）
            new_score2 = score1

            try:
                # 更新玩家2的分数
                cursor.execute("UPDATE players SET score = %s WHERE player_id = %s", (new_score2, player2))
                # 删除玩家1
                cursor.execute("DELETE FROM players WHERE player_id = %s", (player1,))
                conn.commit()
                print(f"✅ 成功将玩家 '{player1}' 的分数 ({score1}) 覆盖到 '{player2}'，新分数为 {new_score2}。")
                print(f"   已删除玩家 '{player1}' 的记录。")
            except Exception as e:
                conn.rollback()
                print(f"❌ 转移失败，已回滚: {e}")
    except pymysql.Error as e:
        print(f"❌ 数据库错误: {e}")

def delete_player(conn):
    print("\n--- 删除玩家 ---")
    player_id = input("请输入要删除的玩家ID: ").strip()
    if not player_id:
        print("❌ 玩家ID不能为空")
        return

    try:
        with conn.cursor() as cursor:
            cursor.execute("SELECT score FROM players WHERE player_id = %s", (player_id,))
            row = cursor.fetchone()
            if not row:
                print(f"❌ 玩家 '{player_id}' 不存在，无法删除")
                return

            confirm = input(f"⚠️ 确认删除玩家 '{player_id}' (分数: {row[0]})? (y/n): ").strip().lower()
            if confirm != 'y':
                print("❌ 删除已取消")
                return

            cursor.execute("DELETE FROM players WHERE player_id = %s", (player_id,))
            conn.commit()
            print(f"✅ 玩家 '{player_id}' 已成功删除。")
    except pymysql.Error as e:
        print(f"❌ 数据库错误: {e}")

def main():
    conn = connect_db()
    print("✅ 已连接到数据库 phrolova_game")

    while True:
        print("\n选项:")
        print("  1. 添加角色")
        print("  2. 转移玩家分数")   # 现在为覆盖模式
        print("  3. 删除玩家")
        print("  4. 退出")           # 退出放在第4项
        choice = input("请选择 (1/2/3/4): ").strip()

        if choice == '1':
            add_character(conn)
        elif choice == '2':
            transfer_score(conn)
        elif choice == '3':
            delete_player(conn)
        elif choice == '4':
            print("👋 再见！")
            break
        else:
            print("⚠️ 无效输入，请重新选择")

    conn.close()

if __name__ == "__main__":
    main()