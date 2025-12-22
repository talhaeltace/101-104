package com.nelit.project101104;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

	@Override
	protected void onCreate(Bundle savedInstanceState) {
		super.onCreate(savedInstanceState);
		// Ensure the window does not draw behind the status bar
		try {
			getWindow().getDecorView().setSystemUiVisibility(android.view.View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
			// For newer APIs ensure status bar is not translucent
			getWindow().clearFlags(android.view.WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
		} catch (Exception e) {
			// ignore on older devices
		}
		// Attempt to hide the status bar so the app appears full-screen
		try {
			if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.R) {
				// API 30+ WindowInsetsController
				final android.view.WindowInsetsController controller = getWindow().getInsetsController();
				if (controller != null) controller.hide(android.view.WindowInsets.Type.statusBars());
			} else {
				// deprecated flags for older devices
				getWindow().getDecorView().setSystemUiVisibility(
					android.view.View.SYSTEM_UI_FLAG_FULLSCREEN | android.view.View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
				);
			}
		} catch (Exception e) {
			// ignore if hiding not supported
		}
	}

}
