import asyncio
from core.database import init_db, async_session_factory
from core.models import UserProfile
from core.browser_profile_manager import BrowserProfileManager

async def setup_test_profile():
    # Создаем таблицы в БД
    await init_db()
    
    async with async_session_factory() as session:
        # Проверяем, есть ли уже тестовый профиль
        from sqlalchemy import select
        result = await session.execute(select(UserProfile).where(UserProfile.profile_name == "stealth_test"))
        profile = result.scalar_one_or_none()
        
        if not profile:
            # Создаем фейковые метаданные: имитируем мощный ПК с RTX 4090
            fake_metadata = {
                "ua": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                "vendor": "Google Inc. (NVIDIA)", 
                "renderer": "ANGLE (NVIDIA, NVIDIA GeForce RTX 4090 Direct3D11 vs_5_0 ps_5_0, D3D11)",
                "width": 2560,
                "height": 1440,
                "canvas_seed": 777
            }
            
            profile = UserProfile(
                profile_name="stealth_test",
                evm_wallet_address="0x0000000000000000000000000000000000000000",
                private_key="dummy_key",
                fingerprint_metadata=fake_metadata
            )
            session.add(profile)
            await session.commit()
            print("✅ Тестовый профиль (RTX 4090) успешно создан в БД!")
            return profile.id
        return profile.id

async def main():
    profile_id = await setup_test_profile()
    manager = BrowserProfileManager()
    
    print(f"🚀 Запускаем профиль ID: {profile_id}...")
    # Запускаем браузер
    context, playwright, lock_path = await manager.launch_profile(profile_id)
    
    page = await context.new_page()
    
    print("🌐 Переходим на проверку WebGL...")
    await page.goto("https://browserleaks.com/webgl", wait_until="domcontentloaded")
    
    print("👀 Браузер открыт! Посмотри на 'Unmasked Vendor' и 'Renderer' на сайте.")
    print("Они должны показывать RTX 4090, даже если у тебя другая видеокарта.")
    print("Браузер закроется сам через 60 секунд...")
    
    await asyncio.sleep(60)
    
    print("🛑 Закрываем профиль...")
    await manager.close_profile(context, playwright, lock_path)

if __name__ == "__main__":
    asyncio.run(main())