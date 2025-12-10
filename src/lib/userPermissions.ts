import { supabase } from './supabase';

// ============================================
// TYPES
// ============================================

export interface UserPermissions {
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_route: boolean;
  can_team_view: boolean;
}

export interface AppUser {
  id: string;
  username: string;
  role: string;
  email?: string;
  full_name?: string;
  phone?: string;
  is_active: boolean;
  created_at: string;
  last_login_at?: string;
  // Permissions
  can_view: boolean;
  can_edit: boolean;
  can_create: boolean;
  can_delete: boolean;
  can_export: boolean;
  can_route: boolean;
  can_team_view: boolean;
}

// Default permissions based on role
export const DEFAULT_PERMISSIONS: Record<string, UserPermissions> = {
  admin: {
    can_view: true,
    can_edit: true,
    can_create: true,
    can_delete: true,
    can_export: true,
    can_route: true,
    can_team_view: true
  },
  editor: {
    can_view: true,
    can_edit: true,
    can_create: true,
    can_delete: false,
    can_export: true,
    can_route: true,
    can_team_view: false
  },
  viewer: {
    can_view: false,
    can_edit: false,
    can_create: false,
    can_delete: false,
    can_export: false,
    can_route: false,
    can_team_view: false
  },
  user: {
    can_view: false,
    can_edit: false,
    can_create: false,
    can_delete: false,
    can_export: false,
    can_route: false,
    can_team_view: false
  }
};

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Tüm kullanıcıları listele (admin için) - direkt app_users tablosundan
 */
export async function listUsers(): Promise<AppUser[]> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Failed to list users:', error);
      return [];
    }

    console.log('Raw users from DB:', data); // DEBUG

    // app_users tablosundaki veriyi AppUser formatına dönüştür
    return (data || []).map(user => {
      const role = user.role || 'user';
      const roleDefaults = DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS['user'];
      
      // DEBUG: her kullanıcı için yetki değerlerini logla
      console.log(`User ${user.username} permissions from DB:`, {
        can_view: user.can_view,
        can_edit: user.can_edit,
        can_create: user.can_create,
        can_delete: user.can_delete,
        can_export: user.can_export,
        can_route: user.can_route,
        can_team_view: user.can_team_view
      });
      
      return {
        id: user.id,
        username: user.username,
        role: role,
        email: user.email || undefined,
        full_name: user.full_name || undefined,
        phone: user.phone || undefined,
        is_active: user.is_active !== false,
        created_at: user.created_at,
        last_login_at: user.last_login_at || undefined,
        // Permissions - veritabanından gelen değeri kullan, yoksa rol varsayılanı
        can_view: typeof user.can_view === 'boolean' ? user.can_view : roleDefaults.can_view,
        can_edit: typeof user.can_edit === 'boolean' ? user.can_edit : roleDefaults.can_edit,
        can_create: typeof user.can_create === 'boolean' ? user.can_create : roleDefaults.can_create,
        can_delete: typeof user.can_delete === 'boolean' ? user.can_delete : roleDefaults.can_delete,
        can_export: typeof user.can_export === 'boolean' ? user.can_export : roleDefaults.can_export,
        can_route: typeof user.can_route === 'boolean' ? user.can_route : roleDefaults.can_route,
        can_team_view: typeof user.can_team_view === 'boolean' ? user.can_team_view : roleDefaults.can_team_view
      };
    });
  } catch (err) {
    console.error('List users error:', err);
    return [];
  }
}

/**
 * Yeni kullanıcı oluştur
 */
export async function createUser(
  username: string,
  password: string,
  role: string = 'user',
  email?: string,
  fullName?: string,
  phone?: string
): Promise<{ success: boolean; error?: string; data?: { id: string } }> {
  try {
    const { data, error } = await supabase
      .from('app_users')
      .insert({
        username,
        password_hash: password,
        role,
        email: email || null,
        full_name: fullName || null,
        phone: phone || null,
        is_active: true
      })
      .select('id')
      .single();

    if (error) {
      console.error('Failed to create user:', error);
      return { success: false, error: error.message };
    }

    return { success: true, data: { id: data.id } };
  } catch (err) {
    console.error('Create user error:', err);
    return { success: false, error: 'Kullanıcı oluşturulurken hata oluştu' };
  }
}

/**
 * Kullanıcı güncelle
 */
export async function updateUser(
  userId: string,
  updates: {
    username?: string;
    password?: string;
    role?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    isActive?: boolean;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, unknown> = {};
    if (updates.username) updateData.username = updates.username;
    if (updates.password) updateData.password_hash = updates.password;
    if (updates.role) updateData.role = updates.role;
    if (updates.email !== undefined) updateData.email = updates.email || null;
    if (updates.fullName !== undefined) updateData.full_name = updates.fullName || null;
    if (updates.phone !== undefined) updateData.phone = updates.phone || null;
    if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

    const { error } = await supabase
      .from('app_users')
      .update(updateData)
      .eq('id', userId);

    if (error) {
      console.error('Failed to update user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update user error:', err);
    return { success: false, error: 'Kullanıcı güncellenirken hata oluştu' };
  }
}

/**
 * Kullanıcı yetkilerini güncelle
 */
export async function updateUserPermissions(
  userId: string,
  permissions: Partial<UserPermissions>
): Promise<{ success: boolean; error?: string }> {
  try {
    const updateData: Record<string, boolean> = {};
    if (permissions.can_view !== undefined) updateData.can_view = permissions.can_view;
    if (permissions.can_edit !== undefined) updateData.can_edit = permissions.can_edit;
    if (permissions.can_create !== undefined) updateData.can_create = permissions.can_create;
    if (permissions.can_delete !== undefined) updateData.can_delete = permissions.can_delete;
    if (permissions.can_export !== undefined) updateData.can_export = permissions.can_export;
    if (permissions.can_route !== undefined) updateData.can_route = permissions.can_route;
    if (permissions.can_team_view !== undefined) updateData.can_team_view = permissions.can_team_view;

    console.log('Saving permissions for user:', userId, updateData); // DEBUG

    const { error, data } = await supabase
      .from('app_users')
      .update(updateData)
      .eq('id', userId)
      .select();

    console.log('Save result:', { error, data }); // DEBUG

    if (error) {
      console.error('Failed to update user permissions:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Update user permissions error:', err);
    return { success: false, error: 'Yetkiler güncellenirken hata oluştu' };
  }
}

/**
 * Kullanıcı sil
 */
export async function deleteUser(userId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const { error } = await supabase
      .from('app_users')
      .delete()
      .eq('id', userId);

    if (error) {
      console.error('Failed to delete user:', error);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (err) {
    console.error('Delete user error:', err);
    return { success: false, error: 'Kullanıcı silinirken hata oluştu' };
  }
}
